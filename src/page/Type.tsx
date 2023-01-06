import * as React from "react";
import Pagination from "./block/Pagination";
import { neo4j, getDriver, isInteger } from "../db";
import { Integer, Relationship as Neo4jRelationship } from "neo4j-driver";
import { Button, Checkbox } from "../form";
import { EPage } from "../enums";
import { IPageProps } from "../interfaces";
import TableSortIcon from "./block/TableSortIcon";
import Modal from "./block/Modal";

interface ITypeProps extends IPageProps {
    database: string;
    type: string;
}

interface ITypeState {
    rows: Neo4jRelationship[];
    page: number;
    total: number;
    sort: string[];
    delete: Integer | string | null;
    error: string | null;
}

/**
 * List all relationships with specific relationshipType
 * @todo
 */
class Type extends React.Component<ITypeProps, ITypeState> {
    perPage: number = 20;
    hasElementId: boolean = false;

    state: ITypeState = {
        rows: [],
        page: 1,
        total: 0,
        sort: [],
        delete: null,
        error: null,
    };

    requestData = () => {
        getDriver()
            .session({
                database: this.props.database,
                defaultAccessMode: neo4j.session.READ,
            })
            .run("MATCH ()-[r:" + this.props.type + "]-() RETURN COUNT(r) AS cnt")
            .then(response1 => {
                const cnt: number = response1.records[0].get("cnt");
                const page: number = this.state.page >= Math.ceil(cnt / this.perPage) ? Math.ceil(cnt / this.perPage) : this.state.page;

                getDriver()
                    .session({
                        database: this.props.database,
                        defaultAccessMode: neo4j.session.READ,
                    })
                    .run("MATCH (a)-[r:" + this.props.type + "]->(b) RETURN r " + (this.state.sort.length ? "ORDER BY " + this.state.sort.join(", ") : "") + " SKIP $s LIMIT $l", {
                        s: neo4j.int((page - 1) * this.perPage),
                        l: neo4j.int(this.perPage),
                    })
                    .then(response2 => {
                        this.setState({
                            rows: response2.records.map(record => record.get("r")),
                            total: cnt,
                            page: page,
                        });
                        this.hasElementId =
                            response2.records.length > 0 &&
                            "elementId" in response2.records[0].get("r") &&
                            response2.records[0].get("r").elementId !== neo4j.integer.toString(response2.records[0].get("r").identity);
                    })
                    .catch(console.error);
            })
            .catch(console.error);
    };

    componentDidMount() {
        this.requestData();
    }

    shouldComponentUpdate(nextProps, nextState, nextContext) {
        if (nextProps.active && this.props.active !== nextProps.active) {
            this.requestData();
        }
        return true;
    }

    handleChangePage = (page: number) => {
        this.setState(
            {
                page: page,
            },
            this.requestData
        );
    };

    handleClearError = () => {
        this.setState({
            error: null,
        });
    };

    handleOpenDeleteModal = (id: Integer | string) => {
        this.setState({
            delete: id,
        });
    };

    handleDeleteModalConfirm = () => {
        getDriver()
            .session({
                database: this.props.database,
                defaultAccessMode: neo4j.session.WRITE,
            })
            .run("MATCH ()-[r]-() WHERE " + (this.hasElementId ? "elementId(r)" : "id(r)") + " = $id DELETE r", {
                id: this.state.delete,
            })
            .then(response => {
                if (response.summary.counters.updates().nodesDeleted > 0) {
                    this.requestData();
                    this.props.tabManager.close((this.hasElementId ? this.state.delete : neo4j.integer.toString(this.state.delete)) + this.props.database);
                    this.props.toast("Relationship deleted");
                }
            })
            .catch(error => {
                this.setState({
                    error: error.message,
                });
            })
            .finally(() => {
                this.handleDeleteModalCancel();
            });
    };

    handleDeleteModalCancel = () => {
        this.setState({
            delete: null,
        });
    };

    handleSetSort = (value: string) => {
        let i = this.state.sort.indexOf(value),
            j = this.state.sort.indexOf(value + " DESC");
        let copy = [...this.state.sort];

        if (i !== -1) {
            copy[i] = value + " DESC";
        } else if (j !== -1) {
            copy.splice(i, 1);
        } else {
            copy.push(value);
        }

        this.setState(
            {
                sort: copy,
            },
            this.requestData
        );
    };

    render() {
        if (!this.props.active) return;
        document.title = this.props.type + " relationship (db: " + this.props.database + ")";

        let keys = [];
        for (let row of this.state.rows) {
            for (let k in row.properties) {
                if (keys.indexOf(k) === -1) {
                    keys.push(k);
                }
            }
        }
        //add sorted keys which are not available in visible rows
        for (let s of this.state.sort) {
            s = s.replace(/^n\.([^ ]+)(?: DESC)?$/, "$1");
            if (keys.indexOf(s) === -1) keys.push(s);
        }
        keys.sort();

        return (
            <>
                {this.state.delete && (
                    <Modal title="Are you sure?" color="is-danger" handleClose={this.handleDeleteModalCancel}>
                        <div className="buttons is-justify-content-flex-end">
                            <Button text="Confirm" icon="fa-solid fa-check" onClick={this.handleDeleteModalConfirm} color="is-danger" />
                            <Button text="Cancel" icon="fa-solid fa-xmark" onClick={this.handleDeleteModalCancel} color="is-secondary" />
                        </div>
                    </Modal>
                )}

                {typeof this.state.error === "string" && (
                    <div className="message is-danger">
                        <div className="message-header">
                            <p>Error</p>
                            <button className="delete" aria-label="delete" onClick={this.handleClearError}></button>
                        </div>
                        <div className="message-body">{this.state.error}</div>
                    </div>
                )}

                <div className="mb-3">
                    <span className="icon-text is-flex-wrap-nowrap">
                        <span className="icon">
                            <i className="fa-solid fa-terminal" aria-hidden="true"></i>
                        </span>
                        <span className="is-family-code">
                            {"MATCH (a)-[" +
                                this.props.type +
                                "]->(b) RETURN r " +
                                (this.state.sort.length ? "ORDER BY " + this.state.sort.join(", ") : "") +
                                " SKIP " +
                                (this.state.page - 1) * this.perPage +
                                " LIMIT " +
                                this.perPage}
                        </span>
                    </span>
                </div>

                <div className="buttons mb-1">
                    <Button
                        icon="fa-solid fa-plus"
                        text="Create relationship"
                        color="is-primary"
                        onClick={() =>
                            this.props.tabManager.add(this.props.tabManager.generateName("New relationship"), "fa-regular fa-square-plus", EPage.Rel, {
                                id: null,
                                database: this.props.database,
                                type: this.props.type,
                            })
                        }
                    />
                </div>

                <div className="table-container">
                    <table className="table is-bordered is-striped is-narrow is-hoverable">
                        <thead>
                            <tr>
                                <th rowSpan={2}></th>
                                <th colSpan={this.props.settings.showElementId && this.hasElementId ? 2 : 1}>Relationship</th>
                                <th colSpan={this.props.settings.showElementId && this.hasElementId ? 2 : 1}>Start node</th>
                                <th colSpan={this.props.settings.showElementId && this.hasElementId ? 2 : 1}>End node</th>
                                <th colSpan={keys.length}>properties</th>
                            </tr>
                            <tr>
                                <th rowSpan={2} className="nowrap is-clickable" onClick={() => this.handleSetSort("id(r)")}>
                                    id <TableSortIcon sort="id(r)" current={this.state.sort} />
                                </th>
                                {this.props.settings.showElementId && this.hasElementId && (
                                    <th rowSpan={2} className="nowrap is-clickable" onClick={() => this.handleSetSort("elementId(r)")}>
                                        elementId <TableSortIcon sort="elementId(r)" current={this.state.sort} />
                                    </th>
                                )}
                                <th className="nowrap is-clickable" onClick={() => this.handleSetSort("id(a)")}>
                                    id <TableSortIcon sort={"id(a)"} current={this.state.sort} />
                                </th>
                                {this.props.settings.showElementId && this.hasElementId && (
                                    <th className="nowrap is-clickable" onClick={() => this.handleSetSort("elementId(a)")}>
                                        elementId <TableSortIcon sort={"elementId(a)"} current={this.state.sort} />
                                    </th>
                                )}
                                <th className="nowrap is-clickable" onClick={() => this.handleSetSort("id(b)")}>
                                    id <TableSortIcon sort={"id(b)"} current={this.state.sort} />
                                </th>
                                {this.props.settings.showElementId && this.hasElementId && (
                                    <th className="nowrap is-clickable" onClick={() => this.handleSetSort("elementId(b)")}>
                                        elementId <TableSortIcon sort={"elementId(b)"} current={this.state.sort} />
                                    </th>
                                )}
                                {keys.map(key => (
                                    <th key={"th-" + key} className="nowrap is-clickable" onClick={() => this.handleSetSort("r." + key)}>
                                        {key} <TableSortIcon sort={"r." + key} current={this.state.sort} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {this.state.rows.map(row => (
                                <tr key={"tr-" + neo4j.integer.toString(row.identity)}>
                                    <td>
                                        <div className="is-flex-wrap-nowrap buttons">
                                            <Button
                                                icon="fa-solid fa-pen-clip"
                                                title="Edit"
                                                onClick={() =>
                                                    this.props.tabManager.add(this.props.tabManager.generateName("Rel", row.identity), "fa-solid fa-pen-to-square", EPage.Rel, {
                                                        id: this.hasElementId ? row.elementId : row.identity,
                                                        database: this.props.database,
                                                    })
                                                }
                                            />
                                            <Button
                                                icon="fa-regular fa-trash-can"
                                                color="is-danger is-outlined"
                                                title="Delete"
                                                onClick={() => this.handleOpenDeleteModal(this.hasElementId ? row.elementId : row.identity)}
                                            />
                                        </div>
                                    </td>
                                    <td>{neo4j.integer.toString(row.identity)}</td>
                                    {this.props.settings.showElementId && this.hasElementId && <td className="nowrap is-size-7">{row.elementId}</td>}
                                    <td>{neo4j.integer.toString(row.start)}</td>
                                    {this.props.settings.showElementId && this.hasElementId && <td className="nowrap is-size-7">{row.startNodeElementId}</td>}
                                    <td>{neo4j.integer.toString(row.end)}</td>
                                    {this.props.settings.showElementId && this.hasElementId && <td className="nowrap is-size-7">{row.endNodeElementId}</td>}
                                    {keys.map(key => (
                                        <td key={"td-" + key}>{key in row.properties && this.printProperty(row.properties[key])}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <Pagination page={this.state.page} pages={Math.ceil(this.state.total / this.perPage)} action={this.handleChangePage} />
            </>
        );
    }

    printProperty = (property: any): string | JSX.Element => {
        if (isInteger(property)) return neo4j.integer.toString(property);
        if (Array.isArray(property)) return "[" + property.join(", ") + "]";
        if (typeof property === "boolean") return <Checkbox name="" label="" checked={property} disabled />;
        return property.toString();
    };
}

export default Type;