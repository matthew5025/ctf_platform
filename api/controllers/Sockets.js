var wss = null
var collections = null
var socketConns = {}
const ws = require('ws')
const { checkPermissions, checkUsernamePerms } = require('./../utils/permissionUtils.js')
const Connection = require('./../utils/mongoDB.js')


// Give the client 10 seconds to get authed, if not we will disconnect them
const kickTimeOut = async (socket) => {
    if ((!"isAuthed" in socket) || socket.isAuthed === false) {
        socket.terminate()
    }
}

const startup = async (server) => {
    collections = Connection.collections
    wss = new ws.Server({ server })

    //websocket methods
    wss.on('connection', (socket) => {
        socket.isAlive = true
        socket.isAuthed = false
        socket.on('pong', () => { socket.isAlive = true }); // check for any clients that dced without informing the server
        setTimeout(() => { kickTimeOut(socket) }, 10000)

        socket.on("message", async (msg) => {
            const data = JSON.parse(msg)
            if (data.type === "init") {
                const payload = data.data
                //Authenticate
                if (payload.auth == undefined) {
                    socket.send(JSON.stringify({ type: "init", data: "missing-auth" }));
                    return socket.terminate()
                }
                const permsObject = await checkPermissions(payload.auth);
                if (permsObject === false) {
                    socket.send(JSON.stringify({ type: "init", data: "bad-auth" }))
                    return socket.terminate()
                }
                // Check if any other clients of the same username are connected, and if so, disconnect them
                socket.isAuthed = true

                const maxSockets = NodeCacheObj.get("maxSockets")
                let socketNumber = 0
                if (permsObject.username in socketConns) {
                    if (socketConns[permsObject.username].length >= maxSockets) {
                        const removeSocket = socketConns[permsObject.username].splice(0, socketConns[permsObject.username].length - maxSockets + 1)
                        for (let i = 0; i < removeSocket.length; i++) {
                            removeSocket[i].send(JSON.stringify({ type: "init", data: "max-connections" }))
                            removeSocket[i].close(1000)
                        }
                    }
                    socketNumber = socketConns[permsObject.username].length
                    socketConns[permsObject.username].push(socket)
                }
                else {
                    socketConns[permsObject.username] = [socket]
                }
                socket.username = permsObject.username
                socket.id = socketNumber

                const latestSolveSubmissionID = NodeCacheObj.get("latestSolveSubmissionID")
                const teamUpdateID = NodeCacheObj.get("teamUpdateID")
                const teamList = NodeCacheObj.get("teamListCache")
                const transactionCache = NodeCacheObj.get("transactionsCache")
                
                let finalChallenges = []
                // Outdated team update, update everything
                if (payload.teamUpdateID < NodeCacheObj.get("teamUpdateID")) {
                    let changes = {}
                    let finalData = []

                    for (let i = 0; i < transactionCache.length; i++) {
                        const current = transactionCache[i]
                
                        if (current.author in changes) changes[current.author].changes.push(current)
                        else {
                            let members = [current.author]
                            let isTeam = false
                            if ("originalAuthor" in current) { // user is in a team
                                members = teamList[current.author].members
                                isTeam = true
                            }
                            changes[current.author] = { _id: current.author, changes: [current], members: members, isTeam: isTeam }
                        }
                    }

                    for (username in changes) {
                        finalData.push(changes[username])
                    }

                    socket.send(JSON.stringify({ type: "init", msg: "team-update", data: {users: finalData}, lastChallengeID: latestSolveSubmissionID, teamUpdateID: teamUpdateID }))
                }
                else {
                    // Some transactions are outdated, only update those
                    if (payload.lastChallengeID < latestSolveSubmissionID) {
                        if (NodeCacheObj.get("adminShowDisable")) {
                            for (let i = 0; i < transactionCache.length; i++) {
                                if (transactionCache[i].lastChallengeID > payload.lastChallengeID && checkUsernamePerms(transactionCache[i].author) !== 2) {
                                    finalChallenges.push(transactionCache[i])
                                }

                            }
                        }
                        else {
                            for (let i = 0; i < transactionCache.length; i++) {
                                if (transactionCache[i].lastChallengeID > payload.lastChallengeID) {
                                    finalChallenges.push(transactionCache[i])
                                }
                            }
                        }
                        socket.send(JSON.stringify({ type: "init", data: finalChallenges, lastChallengeID: latestSolveSubmissionID }))
                    }
                    else socket.send(JSON.stringify({ type: "init", data: "up-to-date" }))
                }
            }
        })
        socket.on('close', (e) => {
            if (socket.username in socketConns) {
                for (let i = 0; i < socketConns[socket.username]; i++) {
                    if (socket.readyState === ws.CLOSED) {
                        socketConns[socket.username].splice(i, 1)
                        break
                    }
                }
                if (socketConns[socket.username].length === 0) delete socketConns[socket.username]
            }
        })
    })

    // check for any clients that dced without informing the server
    const interval = setInterval(function ping() {
        wss.clients.forEach(function each(ws) {
            if (ws.isAlive === false) {
                if (ws.username in socketConns) {
                    for (let i = 0; i < socketConns[ws.username]; i++) {
                        if (ws.isAlive === false) {
                            socketConns[ws.username].splice(i, 1)
                            break
                        }
                    }
                    if (socketConns[ws.username].length === 0) delete socketConns[ws.username]
                }
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', function close() {
        clearInterval(interval);
    });
}

const broadCastNewSolve = (solveDetails) => {
    if (NodeCacheObj.get("adminShowDisable")) {
        for (let i = 0; i < solveDetails.length; i++) {
            if (checkUsernamePerms(solveDetails[i].author) === 2) solveDetails.splice(i, 1)
        }
    }
    wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN && client.isAuthed === true) {
            client.send(JSON.stringify({ type: "score", data: solveDetails }));
        }
    })
}

const broadCastNewTeamChange = () => {
    let changes = {}
    let finalData = []
    const teamUpdateID = NodeCacheObj.get("teamUpdateID")
    const teamList = NodeCacheObj.get("teamListCache")
    const transactionsCache = NodeCacheObj.get("transactionsCache")

    for (let i = 0; i < transactionsCache.length; i++) {
        const current = transactionsCache[i]

        if (current.author in changes) changes[current.author].changes.push(current)
        else {
            let members = [current.author]
            let isTeam = false
            if ("originalAuthor" in current) { // user is in a team
                members = teamList[current.author].members
                isTeam = true
            }
            changes[current.author] = { _id: current.author, changes: [current], members: members, isTeam: isTeam }
        }
    }

    for (username in changes) {
        finalData.push(changes[username])
    }

    wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN && client.isAuthed === true) {
            client.send(JSON.stringify({ type: "team-update", data: { users: finalData }, teamUpdateID: teamUpdateID }));
        }
    })
}



module.exports = { startup, broadCastNewSolve, broadCastNewTeamChange }