const Connection = require('./../utils/mongoDB.js')
const MongoDB = require('mongodb')
const sharp = require('sharp');
const { broadCastNewSolve } = require('./../controllers/Sockets.js')
const sanitizeFile = require('sanitize-filename');
const DomPurify = require('dompurify')
const path = require('path');
const fs = require('fs')


const disableStates = async (req, res) => {
    if (req.locals.perms < 2) throw new Error('Permissions');
    res.send({
        success: true,
        states: { submissionDisabled: NodeCacheObj.get("submissionDisabled"), maxSockets: NodeCacheObj.get("maxSockets") }
    });
}

const list = async (req, res) => {
    const collections = Connection.collections
    let challenges = []
    if (req.locals.perms < 2) {
        challenges = await collections.challs.aggregate([{
            $match: { visibility: true }
        }, {
            $group: {
                _id: '$category',
                challenges: {
                    $push: {
                        _id: "$_id",
                        name: '$name',
                        points: '$points',
                        solved: { $in: [req.locals.username.toLowerCase(), '$solves'] },
                        firstBlood: { $arrayElemAt: ['$solves', 0] },
                        tags: '$tags',
                        requires: '$requires'
                    }
                }
            }
        }]).toArray();

        const categoryMeta = NodeCacheObj.get("categoryMeta")
        for (let i = 0; i < challenges.length; i++) {
            if (challenges[i]._id in categoryMeta) {
                const currentMeta = categoryMeta[challenges[i]._id]
                if (currentMeta.visibility === false) challenges.splice(i, 1) // remove categories that are hidden
                else {
                    if ("time" in currentMeta && new Date() < new Date(currentMeta.time[0])) {
                        challenges[i].challenges = []
                    }
                    challenges[i].meta = currentMeta
                }
            }
        }
    }
    else {
        challenges = await collections.challs.aggregate([{
            $group: {
                _id: '$category',
                challenges: {
                    $push: {
                        _id: "$_id",
                        name: '$name',
                        points: '$points',
                        solved: { $in: [req.locals.username.toLowerCase(), '$solves'] },
                        firstBlood: { $arrayElemAt: ['$solves', 0] },
                        tags: '$tags',
                        visibility: '$visibility',
                        requires: '$requires'
                    }
                }
            }
        }]).toArray();

        const categoryMeta = NodeCacheObj.get("categoryMeta")
        for (let i = 0; i < challenges.length; i++) {
            if (challenges[i]._id in categoryMeta) {
                challenges[i].meta = categoryMeta[challenges[i]._id]
            }
            else challenges[i].meta = { visibility: true }
        }
    }
    res.send({
        success: true,
        challenges: challenges
    });
}

const listCategory = async (req, res) => {
    const collections = Connection.collections
    const challenges = await collections.challs.aggregate([{
        $match: {
            visibility: true,
            category: req.params.category
        }
    }, {
        $project: {
            _id: "$_id",
            name: '$name',
            points: '$points',
            solved: { $in: [req.locals.username.toLowerCase(), '$solves'] },
            firstBlood: { $arrayElemAt: ['$solves', 0] },
            tags: '$tags',
            requires: '$requires'
        }
    }]).toArray();
    if (challenges.length == 0) throw new Error('NotFound')
    res.send({
        success: true,
        challenges: challenges
    });
}


const listCategories = async (req, res) => {
    const collections = Connection.collections
    res.send({
        success: true,
        categories: await collections.challs.distinct('category', { visibility: true })
    });
}

const listCategoryInfo = async (req, res) => {
    const collections = Connection.collections
    if (req.locals.perms < 2) throw new Error('Permissions');
    const categoryMeta = NodeCacheObj.get("categoryMeta")
    let newCategoryMeta = {}
    const categories = await collections.challs.distinct('category')
    // this copies over category meta data ONLY if the category still exists in the categories of the challenge list
    // hence, categories inside categoryMeta which no longer exist inside challenge list are deleted
    // categories inside the challenge list but not in categoryMeta are given a new object
    for (let i = 0; i < categories.length; i++) {
        if (categories[i] in categoryMeta) newCategoryMeta[categories[i]] = categoryMeta[categories[i]]
        else newCategoryMeta[categories[i]] = { visibility: true }
    }
    await collections.cache.updateOne({}, { '$set': { categoryMeta: newCategoryMeta } })
    res.send({
        success: true,
        categories: newCategoryMeta
    });
}

const listAll = async (req, res) => {
    const collections = Connection.collections
    if (req.locals.perms < 2) throw new Error('Permissions');
    res.send({
        success: true,
        challenges: (await collections.challs.find({}, { projection: { name: 1, category: 1, points: 1, visibility: 1, solves: 1, requires: 1 } }).toArray())
    });
}




const show = async (req, res) => {
    const collections = Connection.collections
    const filter = req.locals.perms == 2 ? { _id: MongoDB.ObjectId(req.params.chall) } : { visibility: true, _id: MongoDB.ObjectId(req.params.chall) };
    let chall = await collections.challs.findOne(filter, { projection: { visibility: 0, flags: 0, _id: 0 } });


    if (!chall) throw new Error('NotFound')
    const categoryMeta = NodeCacheObj.get("categoryMeta")
    if (chall.category in categoryMeta && req.locals.perms < 2) {
        const currentMeta = categoryMeta[chall.category]
        if (currentMeta.visibility === false) throw new Error('NotFound')
        else if ("time" in currentMeta) {
            const currentTime = new Date()
            if (currentTime < new Date(currentMeta.time[0])) {
                throw new Error('NotFound')
            }
        }
    }
    if ("requires" in chall && req.locals.perms < 2) {
        const solved = await collections.challs.findOne({ _id: MongoDB.ObjectId(chall.requires) }, { projection: { _id: 0, solves: 1 } })
        if (!solved) return res.send({ success: false, error: "required-challenge-not-found" })
        if (!(solved.solves.includes(req.locals.username))) return res.send({ success: false, error: "required-challenge-not-completed" })
    }
    if (chall.hints != undefined)
        chall.hints.forEach(hint => {
            if (hint.purchased.includes(req.locals.username)) {
                hint.bought = true;
                delete hint.cost;
            }
            else {
                hint.bought = false;
                delete hint.hint;
            }
            delete hint.purchased;
        });
    if (chall.writeup != undefined) {
        //If only send writeup after submitting flag option is ticked, check if challenge is completed before sending writeup link
        if (chall.writeupComplete) {
            if (chall.solves.find(element => element === req.locals.username) === undefined) chall.writeup = "CompleteFirst"
        }
    }
    if (chall.max_attempts != 0)
        chall.used_attempts = await collections.transactions.countDocuments({
            author: req.locals.username,
            challengeID: MongoDB.ObjectId(req.params.chall),
            type: 'submission'
        }, { limit: chall.max_attempts });
    res.send({
        success: true,
        chall: chall
    });
}

const showDetailed = async (req, res) => {
    const collections = Connection.collections
    if (req.locals.perms < 2) throw new Error('Permissions');
    const chall = await collections.challs.findOne({ _id: MongoDB.ObjectId(req.params.chall) }, null);
    if (!chall) {
        res.code(400);
        res.send({
            success: false,
            error: 'notfound'
        });
        return;
    }
    res.send({
        success: true,
        chall: chall
    });
}

const hint = async (req, res) => {
    const collections = Connection.collections
    let findObject = { visibility: true, _id: MongoDB.ObjectId(req.body.chall) }
    if (req.locals.perms === 2) findObject = { _id: MongoDB.ObjectId(req.body.chall) }
    let hints = (await collections.challs.findOne(findObject, {
        projection: {
            name: 1,
            hints: { $slice: [req.body.id, 1] },
            requires: 1,
            category: 1,
            _id: 1
        }
    }));

    if (!hints) throw new Error('NotFound');
    const categoryMeta = NodeCacheObj.get("categoryMeta")
    if (hints.category in categoryMeta && req.locals.perms < 2) {
        const currentMeta = categoryMeta[hints.category]
        if (currentMeta.visibility === false) throw new Error('NotFound')
        else if ("time" in currentMeta) {
            const currentTime = new Date()
            if (currentTime < new Date(currentMeta.time[0])) {
                throw new Error('NotFound')
            }
        }
    }
    if ("requires" in hints && req.locals.perms < 2) {
        const solved = await collections.challs.findOne({ _id: MongoDB.ObjectId(hints.requires) }, { projection: { _id: 0, solves: 1 } })
        if (!solved) return res.send({ success: false, error: "required-challenge-not-found" })
        if (!(solved.solves.includes(req.locals.username))) return res.send({ success: false, error: "required-challenge-not-completed" })
    }

    if (!hints.hints[0]) throw new Error('OutOfRange');
    let Gtimestamp = new Date()
    if (!hints.hints[0].purchased.includes(req.locals.username)) {
        await collections.challs.updateOne({
            _id: MongoDB.ObjectId(req.body.chall)
        }, {
            $push: {
                [`hints.${req.body.id}.purchased`]: req.locals.username
            }
        });
        let latestSolveSubmissionID = NodeCacheObj.get("latestSolveSubmissionID")
        latestSolveSubmissionID += 1
        NodeCacheObj.set("latestSolveSubmissionID", latestSolveSubmissionID)
        const usernameTeamCache = NodeCacheObj.get("usernameTeamCache")
        let insertDoc = {
            author: req.locals.username,
            challenge: hints.name,
            challengeID: MongoDB.ObjectId(req.body.chall),
            type: 'hint',
            timestamp: Gtimestamp,
            points: -hints.hints[0].cost,
            hint_id: parseInt(req.body.id),
            lastChallengeID: latestSolveSubmissionID
        }
        if (req.locals.username in usernameTeamCache) {
            insertDoc.author = usernameTeamCache[req.locals.username]
            insertDoc.originalAuthor = req.locals.username
        } 
        let transactionsCache = NodeCacheObj.get("transactionsCache")
        await collections.transactions.insertOne(insertDoc);
        await collections.cache.updateOne({}, { '$set': { latestSolveSubmissionID: latestSolveSubmissionID } })
        let transactionDoc = {
            _id: insertDoc._id,
            author: insertDoc.author,
            challenge: hints.name,
            challengeID: MongoDB.ObjectId(req.body.chall),
            timestamp: Gtimestamp,
            points: -hints.hints[0].cost,
            lastChallengeID: latestSolveSubmissionID
        }
        if ("originalAuthor" in insertDoc) transactionDoc.originalAuthor = insertDoc.originalAuthor
        transactionsCache.push(transactionDoc)
        broadCastNewSolve([{
            _id: insertDoc._id,
            author: req.locals.username in usernameTeamCache ? usernameTeamCache[req.locals.username] : req.locals.username,
            timestamp: Gtimestamp,
            points: -hints.hints[0].cost,
            lastChallengeID: latestSolveSubmissionID
        }])
    }

    res.send({
        success: true,
        hint: hints.hints[0].hint
    });
}

const submit = async (req, res) => {
    const collections = Connection.collections
    try {
        const chall = await collections.challs.findOne({ _id: MongoDB.ObjectId(req.body.chall) }, { projection: { name: 1, points: 1, flags: 1, solves: 1, max_attempts: 1, requires: 1, dynamic: 1, initial: 1, minSolves: 1, minimum: 1, category: 1, visibility: 1 } });
        if (!chall) throw new Error('NotFound');
        if (chall.visibility === false) {
            if (req.locals.perms === 2) throw new Error('AdminHidden')
            else throw new Error('NotFound');
        }

        const categoryMeta = NodeCacheObj.get("categoryMeta")
        if (chall.category in categoryMeta) {
            const currentMeta = categoryMeta[chall.category]
            if (currentMeta.visibility === false) {
                if (req.locals.perms === 2) throw new Error('AdminHidden')
                throw new Error('NotFound')
            }
            else if ("time" in currentMeta) {
                const currentTime = new Date()
                if (currentTime < new Date(currentMeta.time[0])) {
                    if (req.locals.perms === 2) throw new Error('AdminHidden')
                    throw new Error('NotFound')
                }
                else if (currentTime > new Date(currentMeta.time[1])) return res.send({ success: false, error: "submission-disabled" })
            }
        }
        if (NodeCacheObj.get("submissionDisabled")) return res.send({ success: false, error: "submission-disabled" })

        //Check if the required challenge has been solved (if any)

        if ("requires" in chall) {
            const solved = await collections.challs.findOne({ _id: MongoDB.ObjectId(chall.requires) }, { projection: { _id: 0, solves: 1 } })
            if (!solved) return res.send({ success: false, error: "required-challenge-not-found" })
            if (!(solved.solves.includes(req.locals.username))) return res.send({ success: false, error: "required-challenge-not-completed" })
        }
        if (chall.max_attempts != 0) {
            if (await collections.transactions.countDocuments({
                author: req.locals.username.toLowerCase(),
                _id: MongoDB.ObjectId(req.body.chall),
                type: 'submission'
            }) >= chall.max_attempts) throw new Error('Exceeded');
        }
        let Gtimestamp = new Date()
        let latestSolveSubmissionID = 0
        let calculatedPoints = 0
        let gotDecay = false
        let transactionDocumentsUpdated = []
        let solved = false;
        async function insertTransaction(correct = false) {
            const usernameTeamCache = NodeCacheObj.get("usernameTeamCache")
            let transactionsCache = NodeCacheObj.get("transactionsCache")
           
            let insertDocument = {
                author: req.locals.username,
                challenge: chall.name,
                challengeID: MongoDB.ObjectId(req.body.chall),
                timestamp: Gtimestamp,
                type: 'submission',
                points: correct ? calculatedPoints : 0,
                correct: correct,
                submission: req.body.flag,
                lastChallengeID: latestSolveSubmissionID // used as a "last updated time" so we know if to send to the client if the client's last updatedID is less than this
            }
            if (req.locals.username in usernameTeamCache) {
                insertDocument.author = usernameTeamCache[req.locals.username]
                insertDocument.originalAuthor = req.locals.username
            } 
            if (correct) {
                await collections.challs.updateOne({
                    _id: MongoDB.ObjectId(req.body.chall)
                }, {
                    $push: { solves: req.locals.username.toLowerCase() },
                    $set: { points: calculatedPoints }
                });

                if (gotDecay) {
                    await collections.transactions.updateMany({ challengeID: MongoDB.ObjectId(req.body.chall), correct: true }, { $set: { points: calculatedPoints, lastChallengeID: latestSolveSubmissionID } }) // update db transactions
                    for (let i = 0; i < transactionsCache.length; i++) { // update transaction document cache (in memory)
                        if (transactionsCache[i].challengeID == req.body.chall && transactionsCache[i].correct == true) {
                            transactionsCache[i].points = calculatedPoints
                            transactionsCache[i].lastChallengeID = latestSolveSubmissionID
                            transactionDocumentsUpdated.push({
                                _id: transactionsCache[i]._id,
                                author: transactionsCache[i].author,
                                timestamp: transactionsCache[i].timestamp,
                                points: transactionsCache[i].points,
                                lastChallengeID: latestSolveSubmissionID
                            })
                        }
                    }
                }
                await collections.transactions.insertOne(insertDocument);
                transactionDocumentsUpdated.push({
                    _id: insertDocument._id,
                    author: req.locals.username in usernameTeamCache ? usernameTeamCache[req.locals.username] : req.locals.username,
                    timestamp: Gtimestamp,
                    points: calculatedPoints,
                    lastChallengeID: latestSolveSubmissionID
                }) // mongoDB will add the _id field to insertDocument automatically
            }
            else await collections.transactions.insertOne(insertDocument);
            let transactionDoc = {
                _id: insertDocument._id,
                author: insertDocument.author,
                challenge: insertDocument.challenge,
                challengeID: insertDocument.challengeID,
                timestamp: insertDocument.timestamp,
                points: insertDocument.points,
                lastChallengeID: insertDocument.lastChallengeID,
            }
            if ("originalAuthor" in insertDocument) transactionDoc.originalAuthor = insertDocument.originalAuthor
            transactionsCache.push(transactionDoc)
        }

        // update latestSolveSubmissionID to reflect that there is a new transaction
        latestSolveSubmissionID = NodeCacheObj.get("latestSolveSubmissionID")
        latestSolveSubmissionID += 1
        NodeCacheObj.set("latestSolveSubmissionID", latestSolveSubmissionID)
        let challengeCache = NodeCacheObj.get("challengeCache")
        if (chall.flags.includes(req.body.flag)) {
            solved = true;
            if (challengeCache[req.body.chall].solves.includes(req.locals.username)) throw new Error('Submitted'); // "solves" has a uniqueItem validation. Hence, the same solve cannot be inserted twice even if the find has yet to update.
            challengeCache[req.body.chall].solves.push(req.locals.username) // add no. of solve to memory immediately so it won't double solve


            // Calculate score decay if dynamic scoring
            if (chall.dynamic === true) {
                calculatedPoints = (((chall.minimum - chall.initial) / (chall.minSolves ** 2)) * (challengeCache[chall._id].solves.length ** 2)) + chall.initial
                calculatedPoints = Math.ceil(calculatedPoints)
                if (calculatedPoints < chall.minimum) calculatedPoints = chall.minimum

                if (calculatedPoints !== chall.points) {
                    gotDecay = true // mark that there is decay so we need to update all solve transaction documents later
                }
            }
            else calculatedPoints = chall.points // Static score, use score in document

            await insertTransaction(true);
            await collections.cache.updateOne({}, { '$set': { latestSolveSubmissionID: latestSolveSubmissionID } })
            broadCastNewSolve(transactionDocumentsUpdated) // send list of updated transaction records via live update
            res.send({
                success: true,
                data: 'correct'
            });
        }
        // for "double-blind" CTFs - ask me if you want to
        // else if (chall.flags[0].substring(0, 1) == '$') chall.flags.some(flag => {
        // 	if (argon2.verify(flag, req.body.flag)) {
        // 		insertTransaction(true);
        // 		res.send({success: true});
        // 		solved = true;
        // 		return;
        // 	}
        // });
        if (!solved) {
            insertTransaction(false);
            res.send({
                success: true,
                data: 'ding dong your flag is wrong'
            });
        }
    }
    catch (err) {
        switch (err.message) {
            case 'Submitted':
                res.code(400);
                res.send({
                    success: false,
                    error: 'submitted'
                });
                return;
            case 'Exceeded':
                res.code(403);
                res.send({
                    success: false,
                    error: 'exceeded'
                });
                return;
            default:
                throw new Error(err)
        }

    }
}

const newChall = async (req, res) => {
    const collections = Connection.collections
    try {
        if (req.locals.perms < 1) throw new Error('Permissions');
        let doc = {
            name: req.body.name,
            category: req.body.category,
            description: req.locals.perms <= 1 ? DomPurify.sanitize(req.body.description) : req.body.description,
            points: parseInt(req.body.points),
            flags: req.body.flags,

            author: req.locals.username,
            created: new Date(),
            solves: [],
            max_attempts: req.body.max_attempts ? parseInt(req.body.max_attempts) : 0,
            visibility: req.body.visibility ? true : false,
            dynamic: req.body.dynamic,
            minimum: req.body.minimum,
            initial: req.body.initial,
            minSolves: req.body.minSolves
        };
        if (req.body.tags) doc.tags = req.body.tags;
        if (req.body.hints) {
            doc.hints = req.body.hints;
            doc.hints.forEach(hint => {
                if (hint.cost == undefined) throw new Error('MissingHintCost');
                hint.cost = parseInt(hint.cost);
                hint.purchased = [];
            });
        }
        if (req.body.writeup) {
            doc.writeup = req.body.writeup
            doc.writeupComplete = req.body.writeupComplete
        }
        if (req.body.requires) {
            doc.requires = MongoDB.ObjectId(req.body.requires)
        }
        if (req.body.dynamic === true) req.body.points = req.body.initial
        // if (req.body.files) {
        // 	for (file of req.body.files) {
        // 		if (typeof file.url != 'string' || typeof file.name != 'string') {

        // 			return;
        // 		}
        // 		if (file.url.substring(0, )) {

        // 		}
        // 	}
        // }

        let challengeCache = NodeCacheObj.get("challengeCache")
        await collections.challs.insertOne(doc);
        challengeCache[doc._id] = { solves: [] }
        res.send({ success: true });
    }
    catch (err) {
        if (err.name == 'MongoServerError') {
            switch (err.code) {
                case 11000:
                    switch (Object.keys(err.keyPattern)[0]) {
                        case 'name':
                            console.log(err)
                            res.code(403);
                            res.send({
                                success: false,
                                error: 'exists'
                            });
                            return;
                        default:
                            res.send({
                                success: false,
                                error: 'validation'
                            });
                            throw new Error(err)
                    }
            default:
                throw new Error(err)
            }
        }
        if (err.message == 'MissingHintCost') {
            res.code(400);
            res.send({
                success: false,
                error: 'validation'
            });
        }
    }
}

const edit = async (req, res) => {
    const collections = Connection.collections
    try {
        if (req.locals.perms < 2) throw new Error('Permissions');


        let updateObj = {};
        let unsetObj = {};
        const editables = ['name', 'category', 'description', 'points', 'flags', 'tags', 'hints', 'max_attempts', 'visibility', 'writeup', 'writeupComplete', 'requires', 'dynamic', 'initial', 'minSolves', 'minimum'];
        for (field of editables) {
            if (req.body[field] != undefined) {
                if (req.body[field] === '') unsetObj[field] = "" // If the field is set to "", it means the user wants to delete this optional argument
                else updateObj[field] = req.body[field];
            }
        }
        let latestSolveSubmissionID = NodeCacheObj.get("latestSolveSubmissionID")
        latestSolveSubmissionID += 1
        NodeCacheObj.set("latestSolveSubmissionID", latestSolveSubmissionID)
        let calculatedPoints = 0
        let challengeCache = NodeCacheObj.get("challengeCache")
        if (updateObj.dynamic === true) {
            calculatedPoints = (((updateObj.minimum - updateObj.initial) / (updateObj.minSolves ** 2)) * (challengeCache[req.body.id].solves.length ** 2)) + updateObj.initial
            calculatedPoints = Math.ceil(calculatedPoints)
            if (calculatedPoints < updateObj.minimum) calculatedPoints = chall.minimum
            updateObj.points = calculatedPoints
        }
        else {
            calculatedPoints = updateObj.points
        }
        let transactionsCache = NodeCacheObj.get("transactionsCache")
        let transactionDocumentsUpdated = []
        await collections.transactions.updateMany({ challengeID: MongoDB.ObjectId(req.body.id), correct: true }, { $set: { points: calculatedPoints, lastChallengeID: latestSolveSubmissionID } }) // update db transactions
        for (let i = 0; i < transactionsCache.length; i++) { // update transaction document cache
            if (transactionsCache[i].challengeID == req.body.id && transactionsCache[i].correct == true) {
                transactionsCache[i].points = calculatedPoints
                transactionsCache[i].lastChallengeID = latestSolveSubmissionID
                transactionDocumentsUpdated.push({
                    _id: transactionsCache[i]._id,
                    author: transactionsCache[i].author,
                    timestamp: transactionsCache[i].timestamp,
                    points: transactionsCache[i].points,
                    lastChallengeID: latestSolveSubmissionID
                })
            }
        }
        broadCastNewSolve(transactionDocumentsUpdated)
        if (updateObj.hints) {
            updateObj.hints.forEach(hint => {
                if (hint.cost == undefined) throw new Error('MissingHintCost');
                hint.cost = parseInt(hint.cost);
                hint.purchased = hint.purchased != undefined ? hint.purchased : [];
            });
        }
        if ((await collections.challs.updateOne(
            { _id: MongoDB.ObjectId(req.body.id) },
            { '$set': updateObj }
        )).matchedCount === 0) throw new Error('NotFound');
        if (Object.keys(unsetObj).length > 0) {
            if ((await collections.challs.updateOne(
                { _id: MongoDB.ObjectId(req.body.id) },
                { '$unset': unsetObj }
            )).matchedCount === 0) throw new Error('NotFound');
        }
        res.send({ success: true });
    }
    catch (err) {
        if (err.message == 'MissingHintCost') {
            res.code(400);
            res.send({
                success: false,
                error: 'validation'
            });
        }
        if (err.name == 'MongoServerError') {
            switch (err.code) {
                case 11000:
                    switch (Object.keys(err.keyPattern)[0]) {
                        case 'name':
                            res.code(403);
                            res.send({
                                success: false,
                                error: 'exists'
                            });
                            return;
                    }
                    default:
                        res.send({
                            success: false,
                            error: 'validation'
                        });
                        throw new Error(err)
            }
        }
    }
}

const editVisibility = async (req, res) => {
    const collections = Connection.collections
    if (req.locals.perms < 2) throw new Error('Permissions');
    if (!Array.isArray(req.body.challenges)) throw new Error('Validation');
    let challenges = []
    for (let i = 0; i < req.body.challenges.length; i++) challenges.push(MongoDB.ObjectId(req.body.challenges[i]))
    if ((await collections.challs.updateMany({
        _id: {
            $in: challenges
        }
    }, {
        $set: { visibility: req.body.visibility }
    })).matchedCount > 0) res.send({ success: true });
    else throw new Error('NotFound');
}

const editCategory = async (req, res) => {
    const collections = Connection.collections
    if (req.locals.perms < 2) throw new Error('Permissions');

    let categoryMeta = NodeCacheObj.get("categoryMeta")
    // name changed
    if (req.body.new_name !== req.body.name) {
        await collections.challs.updateMany({ category: req.body.name }, { $set: { category: req.body.new_name } })
        categoryMeta[req.body.new_name] = categoryMeta[req.body.name]
        delete categoryMeta[req.body.name]
        fs.rename(path.join(NodeCacheObj.get("categoryUploadPath"), sanitizeFile(req.body.name) + ".webp"), path.join(NodeCacheObj.get("categoryUploadPath"), sanitizeFile(req.body.new_name) + ".webp"), (err) => {
            if (err && err.code !== "ENOENT") {
                console.error(err);
                return res.send({ success: false, error: "file-rename-error" })
            }
        })
    }
    // new categoryImage
    if (req.body.categoryImage !== "") {
        if (req.body.categoryImage === "default") {
            fs.rm(path.join(NodeCacheObj.get("categoryUploadPath"), sanitizeFile(req.body.new_name)) + ".webp", (err) => {
                if (err && err.code !== "ENOENT") {
                    console.error(err)
                }
            })
        }
        else {
            const buff = Buffer.from(req.body.categoryImage, "base64")
            await sharp(buff)
                .toFormat('webp')
                .webp({ quality: 30 })
                .toFile(path.join(NodeCacheObj.get("categoryUploadPath"), sanitizeFile(req.body.new_name)) + ".webp")
                .catch((err) => {
                    console.error(err)
                    return res.send({ success: false, error: "file-upload" })
                })
        }

    }
    if (req.body.time.length > 0) {
        categoryMeta[req.body.new_name].time = [new Date(req.body.time[0]).setSeconds(0), new Date(req.body.time[1]).setSeconds(0)]
    }
    await collections.cache.updateOne({}, { '$set': { categoryMeta: categoryMeta } })
    res.send({ success: true })
}

const editCategoryVisibility = async (req, res) => {
    const collections = Connection.collections
    try {
        if (req.locals.perms < 2) throw new Error('Permissions');
        if (!Array.isArray(req.body.category) || req.body.visibility === undefined) throw new Error('Validation');
        let categoryMeta = NodeCacheObj.get("categoryMeta")
        for (let i = 0; i < req.body.category.length; i++) {
            categoryMeta[req.body.category[i]].visibility = req.body.visibility
        }
        await collections.cache.updateOne({}, { '$set': { categoryMeta: categoryMeta } })
        res.send({ success: true })

    }
    catch (err) {
        if (err.message == 'Validation')
            res.send({
                success: false,
                error: 'validation'
            });
        else throw new Error(err)
    }
}

const deleteChall = async (req, res) => {
    const collections = Connection.collections
    if (req.locals.perms < 2) throw new Error('Permissions');
    let challenges = []
    for (let i = 0; i < req.body.chall.length; i++) {
        const currentID = req.body.chall[i]
        challenges.push(currentID)
        const delReq = await collections.challs.findOneAndDelete({
            _id: MongoDB.ObjectId(currentID)
        }, {
            solves: 1,
            points: 1,
            hints: 1,
            _id: 0
        });
        if (delReq.deletedCount === 0) throw new Error('NotFound');

        let challengeCache = NodeCacheObj.get("challengeCache")
        delete challengeCache[currentID]

        await collections.transactions.deleteMany({ challengeID: MongoDB.ObjectId(currentID) }); //delete transactions from db
    }
    let transactionsCache = NodeCacheObj.get("transactionsCache")
    for (let i = 0; i < transactionsCache.length; i++) {
        if (challenges.includes(transactionsCache[i]._id)) transactionsCache.splice(i, 1) // delete transactions from cache
    }

    res.send({
        success: true
    });
}

module.exports = { disableStates, list, listCategory, listCategories, listAll, listCategoryInfo, show, showDetailed, hint, submit, newChall, edit, editVisibility, editCategory, deleteChall, editCategoryVisibility }
