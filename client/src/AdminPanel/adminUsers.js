import React from 'react';
import { Layout, Menu, Table, message, Dropdown, Button, Select, Modal, Form, Input, Switch, Divider, Space, InputNumber, Card } from 'antd';
import {
    FileUnknownTwoTone,
    ExclamationCircleOutlined,
    DeleteOutlined,
    ClusterOutlined,
    UserOutlined,
    MailOutlined,
    LockOutlined,
    RedoOutlined,
    SearchOutlined,
    KeyOutlined
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { Ellipsis } from 'react-spinners-css';

const { Column } = Table;
const { Option } = Select;
const { confirm } = Modal;


const RegisterForm = (props) => {
    const [form] = Form.useForm();
    return (
        <Form
            form={form}
            name="register_form"
            className="register-form"
            onFinish={(values) => { props.createAccount(values); form.resetFields() }}
        >
            <Form.Item
                name="username"
                rules={[{ required: true, message: 'Please enter a username' }]}
            >
                <Input allowClear prefix={<UserOutlined className="site-form-item-icon" />} placeholder="Enter a new username" />
            </Form.Item>

            <Form.Item
                name="email"
                rules={[
                    { required: true, message: 'Please enter an email' },
                    {
                        type: 'email',
                        message: "Please enter a valid email",
                    },]}
            >
                <Input allowClear prefix={<MailOutlined />} placeholder="Enter a new email" />
            </Form.Item>

            <Form.Item
                name="password"
                rules={[
                    {
                        required: true,
                        message: 'Please input your password!',
                    },
                ]}
                hasFeedback
            >
                <Input.Password allowClear prefix={<LockOutlined />} placeholder="Enter a new password" />
            </Form.Item>

            <Form.Item
                name="confirm"
                dependencies={['password']}
                hasFeedback
                rules={[
                    {
                        required: true,
                        message: 'Please confirm your password!',
                    },
                    ({ getFieldValue }) => ({
                        validator(rule, value) {
                            if (!value || getFieldValue('password') === value) {
                                return Promise.resolve();
                            }
                            return Promise.reject('Oops, the 2 passwords do not match');
                        },
                    }),
                ]}
            >
                <Input.Password allowClear prefix={<LockOutlined />} placeholder="Confirm new password" />
            </Form.Item>
            <Form.Item>
                <Button style={{ marginRight: "1.5vw" }} onClick={() => { props.setState({ createUserModal: false }) }}>Cancel</Button>
                <Button type="primary" htmlType="submit" className="login-form-button" style={{ marginBottom: "1.5vh" }}>Create Account</Button>
            </Form.Item>
        </Form>
    );
};

const ChangePasswordForm = (props) => {
    const [form] = Form.useForm();

    return (
        <Form
            form={form}
            name="changePassword"
            className="change-password-form"
            onFinish={(values) => {

                fetch(window.ipAddress + "/v1/account/adminChangePassword", {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
                    body: JSON.stringify({
                        "password": values.newPassword,
                        "username": props.username,
                    })
                }).then((results) => {
                    return results.json(); //return data in JSON (since its JSON data)
                }).then((data) => {
                    if (data.success === true) {
                        message.success({ content: "Password changed successfully." })
                        form.resetFields()
                        props.setState({ passwordResetModal: false })
                    }
                    else {
                        message.error({ content: "Oops. Unknown error." })
                    }

                }).catch((error) => {
                    console.log(error)
                    message.error({ content: "Oops. There was an issue connecting with the server" });
                })
            }}
            style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%" }}
        >
            <h3>New Password:</h3>
            <Form.Item
                name="newPassword"
                rules={[
                    {
                        required: true,
                        message: 'Please input the new password',
                    },
                ]}
                hasFeedback
            >

                <Input.Password allowClear prefix={<LockOutlined />} placeholder="Enter a new password" />
            </Form.Item>

            <h3>Confirm New Password:</h3>
            <Form.Item
                name="confirm"
                dependencies={['newPassword']}
                hasFeedback
                rules={[
                    {
                        required: true,
                        message: 'Please retype the new password to confirm',
                    },
                    ({ getFieldValue }) => ({
                        validator(rule, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                                return Promise.resolve();
                            }
                            return Promise.reject('Oops, the 2 passwords do not match');
                        },
                    }),
                ]}
            >

                <Input.Password allowClear prefix={<LockOutlined />} placeholder="Confirm new password" />
            </Form.Item>
            <Form.Item>
                <Button style={{ marginRight: "1.5vw" }} onClick={() => { props.setState({ passwordResetModal: false }) }}>Cancel</Button>
                <Button type="primary" htmlType="submit" icon={<KeyOutlined />}>Change Password</Button>
            </Form.Item>
        </Form>
    );
}


class AdminUsers extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            loading: false,
            dataSource: [],
            permissionModal: false,
            permissionLevel: 0,
            permissionChangeTo: 0,
            createUserModal: false,
            username: "",
            modalLoading: false,
            disableRegisterState: false,
            disableLoading: false,
            disableLoading2: false,
            disableLoading3: false,
            disableAdminShow: false,
            selectedTableKeys: [],
            disableEditButtons: true,
            uploadSize: 512000,
            uploadLoading: false,
            uploadPath: "",
            uploadPathLoading: false,
            passwordResetModal: false,
            teamMode: false,
            teamMaxSize: 3
        }
    }

    componentDidMount() {
        this.fillTableData()
        this.getDisableStates()
    }

    getDisableStates = async () => {
        this.setState({ disableLoading: true })
        await fetch(window.ipAddress + "/v1/account/disableStates", {
            method: 'get',
            headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
        }).then((results) => {
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            if (data.success === true) {
                //console.log(data)
                this.setState({ disableRegisterState: data.states.registerDisable, disableAdminShow: data.states.adminShowDisable, uploadSize: data.states.uploadSize, uploadPath: data.states.uploadPath, teamMode: data.states.teamMode, teamMaxSize: data.states.teamMaxSize })
            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }


        }).catch((error) => {
            message.error({ content: "Oops. There was an issue connecting with the server" });
        })
        this.setState({ disableLoading: false })
    }

    fillTableData = async () => {
        this.setState({ loading: true })
        await fetch(window.ipAddress + "/v1/account/list", {
            method: 'get',
            headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
        }).then((results) => {
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            if (data.success === true) {
                for (let i = 0; i < data.list.length; i++) {
                    data.list[i].key = data.list[i].username
                }
                this.setState({ dataSource: data.list })
            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }


        }).catch((error) => {
            message.error({ content: "Oops. There was an issue connecting with the server" });
        })
        this.setState({ loading: false })
    }

    changePermissions = async () => {
        this.setState({ modalLoading: true })
        await fetch(window.ipAddress + "/v1/account/permissions", {
            method: 'post',
            headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
            body: JSON.stringify({
                "username": this.state.username,
                "type": this.state.permissionChangeTo
            })
        }).then((results) => {
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            if (data.success === true) {
                message.success({ content: "Permissions changed successfully" })
                this.setState({ permissionModal: false })
                this.fillTableData()
            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }


        }).catch((error) => {
            console.log(error)
            message.error({ content: "Oops. There was an issue connecting with the server" });
        })
        this.setState({ modalLoading: false })
    }



    deleteAccounts = async (close, users) => {
        this.setState({ disableEditButtons: true })
        await fetch(window.ipAddress + "/v1/account/delete", {
            method: 'post',
            headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
            body: JSON.stringify({
                "users": users,
            })
        }).then((results) => {
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            //console.log(data)
            if (data.success === true) {

                message.success({ content: "User(s) [" + users.join(', ') + "] deleted successfully" })
                this.fillTableData()
            }
            else if (data.error === "delete_self") {
                message.error("You cannot delete your own account here")
            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }



        }).catch((error) => {
            console.log(error)
            message.error({ content: "Oops. There was an issue connecting with the server" });

        })
        close()
        this.setState({ selectedTableKeys: [] })

    }

    createAccount = (values) => {
        this.setState({ modalLoading: true })
        fetch(window.ipAddress + "/v1/account/create", {
            method: 'post',
            headers: { 'Content-Type': 'application/json', 'Authorization': window.IRSCTFToken },
            body: JSON.stringify({
                "username": values.username,
                "password": values.password,
                "email": values.email
            })
        }).then((results) => {
            //console.log(results)
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            console.log(data)
            if (data.success === true) {
                message.success({ content: "Created user " + values.username + " successfully!" })
                this.setState({ modalLoading: false, createUserModal: false })
                this.fillTableData()
            }
            else if (data.error === "email-taken") {
                message.warn({ content: "Oops. Email already taken" })
            }
            else if (data.error === "username-taken") {
                message.warn({ content: "Oops. Username already taken" })
            }
            else if (data.error === "email-formatting") {
                message.error({ content: "Oops. Please check your email format" })
            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }


        }).catch((error) => {
            console.log(error)
            message.error({ content: "Oops. There was an issue connecting with the server" });
        })

    }

    disableSetting = async (setting, value) => {

        let settingName = ""
        if (setting === "registerDisable") {
            settingName = "User registration"
            this.setState({ disableLoading: true })
        }
        else if (setting === "adminShowDisable") {
            settingName = "Admin scores"
            this.setState({ disableLoading2: true })
        }
        else if (setting === "teamMode") {
            settingName = "Team mode"
            this.setState({ disableLoading3: true })
        }
        await fetch(window.ipAddress + "/v1/adminSettings", {
            method: 'post',
            headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
            body: JSON.stringify({
                disable: value,
                setting: setting
            })
        }).then((results) => {
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            if (data.success === true) {
                if (setting === "teamMode") {
                    if (!value) {
                        message.success(settingName + " disabled")
                    }
                    else {
                        message.success(settingName + " enabled")
                    }
                    this.setState({ teamMode: value })
                }
                else {
                    if (value) {
                        message.success(settingName + " disabled")
                    }
                    else {
                        message.success(settingName + " enabled")
                    }
                    if (setting === "registerDisable") this.setState({ disableRegisterState: value })
                    else if (setting === "adminShowDisable") this.setState({ disableAdminShow: value })
                }



            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }


        }).catch((error) => {
            message.error({ content: "Oops. There was an issue connecting with the server" });
        })
        this.setState({ disableLoading: false, disableLoading2: false, disableLoading3: false })
    }

    changeSetting = async (setting, value) => {

        let settingName = ""
        if (setting === "uploadSize") {
            settingName = "Upload size"
            this.setState({ uploadLoading: true })
        }
        else if (setting === "uploadPath") {
            settingName = "Profile pictures upload path"
            this.setState({ uploadPathLoading: true })
        }
        else if (setting === "teamMaxSize") {
            settingName = "Maximum size of teams"
        }
        await fetch(window.ipAddress + "/v1/adminSettings", {
            method: 'post',
            headers: { 'Content-Type': 'application/json', "Authorization": window.IRSCTFToken },
            body: JSON.stringify({
                disable: value,
                setting: setting
            })
        }).then((results) => {
            return results.json(); //return data in JSON (since its JSON data)
        }).then((data) => {
            if (data.success === true) {
                if (setting === "uploadSize") message.success(settingName + " changed to " + value.toString() + "B")
                else message.success(settingName + " changed to " + value.toString())
            }
            else {
                message.error({ content: "Oops. Unknown error" })
            }


        }).catch((error) => {
            message.error({ content: "Oops. There was an issue connecting with the server" });
        })
        this.setState({ uploadLoading: false })
    }


    handleTableSelect = (selectedRowKeys) => {
        this.setState({ selectedTableKeys: selectedRowKeys })
        if (this.state.disableEditButtons && selectedRowKeys.length > 0) this.setState({ disableEditButtons: false })
        else if (!this.state.disableEditButtons && selectedRowKeys.length === 0) this.setState({ disableEditButtons: true })
    }
    render() {
        return (

            <Layout style={{ height: "100%", width: "100%", backgroundColor: "rgba(0, 0, 0, 0)" }}>

                <Modal
                    title={<span>Change User Permissions <ClusterOutlined /></span>}
                    visible={this.state.permissionModal}
                    onOk={this.changePermissions}
                    onCancel={() => { this.setState({ permissionModal: false }) }}
                    confirmLoading={this.state.modalLoading}
                >
                    <Select size="large" value={this.state.permissionChangeTo} style={{ width: "30ch" }} onSelect={(value) => { this.setState({ permissionChangeTo: value }) }}>
                        <Option value="0">0 - Normal User</Option>
                        <Option value="1">1 - Challenge Creator User</Option>
                        <Option value="2">2 - Admin User</Option>
                    </Select>
                    <br />
                    <br />

                    <ul>
                        <li><b>0 - Normal User</b>: Has access to the basic functions and nothing else</li>
                        <li><b>1 - Challenge Creator User</b>: Has the additional power of submitting new challenges, but not modifying existing ones</li>
                        <li><b>2 - Admin User</b>: Has full access to the platform via the admin panel.</li>
                    </ul>
                </Modal>

                <Modal
                    title="Create New Account"
                    visible={this.state.createUserModal}
                    footer={null}
                    onCancel={() => { this.setState({ createUserModal: false }) }}
                >

                    <RegisterForm createAccount={this.createAccount.bind(this)} setState={this.setState.bind(this)}></RegisterForm>
                </Modal>

                <Modal
                    title={"Changing Account Password For: " + this.state.username}
                    visible={this.state.passwordResetModal}
                    footer={null}
                    onCancel={() => { this.setState({ passwordResetModal: false }) }}
                >

                    <ChangePasswordForm username={this.state.username} setState={this.setState.bind(this)}></ChangePasswordForm>
                </Modal>


                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", height: "2ch" }}>
                        <Button type="primary" style={{ marginBottom: "2vh", marginRight: "1ch" }} icon={<UserOutlined />} onClick={() => { this.setState({ createUserModal: true }) }}>Create New User</Button>
                        {this.state.loading && (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                <Ellipsis color="#177ddc" size={60} ></Ellipsis>
                                <h1>Loading Users</h1>
                            </div>
                        )}
                    </div>
                    <Button loading={this.state.loading} type="primary" shape="circle" size="large" style={{ marginBottom: "2vh", maxWidth: "25ch" }} icon={<RedoOutlined />} onClick={async () => { await this.fillTableData(); message.success("Users list refreshed.") }} />
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                    <Button disabled={this.state.disableEditButtons} style={{ marginBottom: "2vh", marginRight: "1ch", backgroundColor: "#a61d24" }} icon={<DeleteOutlined />} onClick={() => {
                        confirm({
                            confirmLoading: this.state.disableEditButtons,
                            title: 'Are you sure you want to delete the user(s) (' + this.state.selectedTableKeys.join(", ") + ')? This action is irreversible.',
                            icon: <ExclamationCircleOutlined />,
                            onOk: (close) => { this.deleteAccounts(close.bind(this), this.state.selectedTableKeys) },
                            onCancel: () => { },
                        });
                    }}>Delete Users</Button>
                </div>
                <Table rowSelection={{ selectedRowKeys: this.state.selectedTableKeys, onChange: this.handleTableSelect.bind(this) }} style={{ overflow: "auto" }} dataSource={this.state.dataSource} locale={{
                    emptyText: (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: "10vh" }}>
                            <FileUnknownTwoTone style={{ color: "#177ddc", fontSize: "400%", zIndex: 1 }} />
                            <h1 style={{ fontSize: "200%" }}>No users found/created</h1>
                        </div>
                    )
                }}>
                    <Column title="Username" dataIndex="username" key="username"
                        render={(text, row, index) => {
                            return <Link to={"/Profile/" + text}><a style={{ fontWeight: 700 }}>{text}</a></Link>;
                        }}
                        filterDropdown={({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
                            <div style={{ padding: 8 }}>
                                <Input
                                    placeholder="Search Username"
                                    value={selectedKeys[0]}
                                    onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                                    onPressEnter={() => confirm()}
                                    style={{ marginBottom: 8, display: 'block' }}
                                    autoFocus
                                />
                                <Space>
                                    <Button
                                        type="primary"
                                        onClick={() => { confirm() }}
                                        icon={<SearchOutlined />}
                                    >
                                        Search
                                    </Button>
                                    <Button onClick={() => clearFilters()}>
                                        Reset
                                    </Button>
                                </Space>
                            </div>
                        )}
                        onFilter={(value, record) => record.username.toLowerCase().includes(value.toLowerCase())}
                        filterIcon={filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />}
                        sorter={(a, b) => {
                            if (a.username < b.username) return -1
                            else return 1
                        }}
                    />
                    <Column title="Email" dataIndex="email" key="email"
                        filterDropdown={({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
                            <div style={{ padding: 8 }}>
                                <Input
                                    placeholder="Search Email"
                                    value={selectedKeys[0]}
                                    onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                                    onPressEnter={() => confirm()}
                                    style={{ marginBottom: 8, display: 'block' }}
                                    autoFocus
                                />
                                <Space>
                                    <Button
                                        type="primary"
                                        onClick={() => { confirm() }}
                                        icon={<SearchOutlined />}
                                    >
                                        Search
                                    </Button>
                                    <Button onClick={() => clearFilters()}>
                                        Reset
                                    </Button>
                                </Space>
                            </div>
                        )}
                        onFilter={(value, record) => record.email.toLowerCase().includes(value.toLowerCase())}
                        filterIcon={filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />}
                    />
                    <Column title="Permissions" dataIndex="type" key="type" filters={[{ text: "Normal User (0)", value: 0 }, { text: "Challenge Creator (1)", value: 1 }, { text: "Admin (2)", value: 2 }]} onFilter={(value, record) => { return value === record.type }} />
                    <Column
                        title=""
                        key="action"
                        render={(text, record) => (
                            <Dropdown trigger={['click']} overlay={
                                <Menu>
                                    <Menu.Item onClick={() => {
                                        this.setState({ permissionModal: true, username: record.username, permissionChangeTo: record.type.toString() })
                                    }}>
                                        <span>
                                            Change Permissions <ClusterOutlined />
                                        </span>
                                    </Menu.Item>
                                    <Menu.Item onClick={() => {
                                        this.setState({ passwordResetModal: true, username: record.username })
                                    }}>
                                        <span>
                                            Change Password <KeyOutlined />
                                        </span>
                                    </Menu.Item>
                                </Menu>
                            } placement="bottomCenter">
                                <Button>Actions</Button>
                            </Dropdown>
                        )}
                    />
                </Table>
                <Divider />

                <div className="settings-responsive2" style={{ display: "flex", justifyContent: "space-around" }}>

                    <Card>
                        <h3>Disable User Registration:  <Switch disabled={this.state.disableLoading} onClick={(value) => this.disableSetting("registerDisable", value)} checked={this.state.disableRegisterState} /></h3>
                        <p>Disables user registration for unregistered users. Admins can still create users from this page.</p>
                    </Card>

                    <Divider type="vertical" style={{ height: "inherit" }} />

                    <Card>
                        <h3>Disable Admin Scores:  <Switch disabled={this.state.disableLoading2} onClick={(value) => this.disableSetting("adminShowDisable", value)} checked={this.state.disableAdminShow} /></h3>
                        <p>Prevents admin scores from showing up on scoreboards and profile pages. Admin solves will still appear under the solve list in challenges. <br /> Please note that disabling/enabling this will require users to reopen ctfx to resync the scoreboard.</p>
                    </Card>
                </div>

                <Divider />

                <div className="settings-responsive2" style={{ display: "flex", justifyContent: "space-around" }}>

                    <Card>
                        <h3>Profile Picture Max Upload Size:
                            <InputNumber
                                formatter={value => `${value}B`}
                                parser={value => value.replace('B', '')}
                                value={this.state.uploadSize}
                                disabled={this.state.uploadLoading}
                                onChange={(value) => this.setState({ uploadSize: value })}
                                onPressEnter={(e) => { this.changeSetting("uploadSize", this.state.uploadSize) }} /></h3>
                        <p>Sets the maximum file upload size for profile pictures (in Bytes). Press <b>Enter</b> to save</p>
                    </Card>

                    <Divider type="vertical" style={{ height: "inherit" }} />

                    <Card>
                        <h3>Profile Picture Upload Path
                            <Input
                                value={this.state.uploadPath}
                                onChange={(e) => this.setState({ uploadPath: e.target.value })}
                                onPressEnter={(e) => { this.changeSetting("uploadPath", this.state.uploadPath) }} /></h3>
                        <p>Sets the file upload path for profile pictures. Please ensure that the folder has the appropriate permissions <br />set for the Node process to save the file there. Press <b>Enter</b> to save</p>
                    </Card>
                </div>

                <Divider />

                <div className="settings-responsive2" style={{ display: "flex", justifyContent: "space-around" }}>

                    <Card>
                        <h3>Max Team Size
                            <InputNumber
                                value={this.state.teamMaxSize}
                                onChange={(value) => this.setState({ teamMaxSize: value })}
                                onPressEnter={(e) => { this.changeSetting("teamMaxSize", this.state.teamMaxSize) }} /></h3>
                        <p>Sets the maximum number of members in a team. Press <b>Enter</b> to save</p>
                    </Card>

                    <Divider type="vertical" style={{ height: "inherit" }} />

                    <Card>
                        <h3>Enable Teams:  <Switch disabled={this.state.disableLoading3} onClick={(value) => this.disableSetting("teamMode", value)} checked={this.state.teamMode} /></h3>
                        <p>Enable teams for the platform. Users in a team will have their scores combined on the scoreboard <br /> Please note that disabling/enabling this will require users to reopen ctfx to resync the scoreboard.</p>
                    </Card>
                </div>

            </Layout>
        );
    }
}

export default AdminUsers;