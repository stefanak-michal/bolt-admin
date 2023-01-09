import * as React from "react";
import "./main.sass";
import Login from "./Login";
import Logged from "./Logged";

class App extends React.Component {
    state = {
        logged: false,
    };

    handleLogin = () => {
        this.setState({
            logged: true,
        });
    };

    handleLogout = () => {
        localStorage.removeItem("login");
        this.setState({
            logged: false,
        });
    };

    render() {
        return (
            <>
                {this.state.logged ? <Logged handleLogout={this.handleLogout} /> : <Login handleLogin={this.handleLogin} />}

                <footer className="footer">
                    <div className="content has-text-centered">
                        <b>Bolt-Admin</b> by Michal Stefanak
                        <br />
                        <a href="https://github.com/stefanak-michal/bolt-admin" target="_blank" className="icon-text" rel="noreferrer">
                            <span className="icon">
                                <i className="fa-brands fa-github"></i>
                            </span>
                            <span>GitHub</span>
                        </a>
                    </div>
                </footer>
            </>
        );
    }
}

export default App;
