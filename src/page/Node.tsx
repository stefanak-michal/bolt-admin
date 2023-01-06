import * as React from "react";
import { getDriver, isInteger, neo4j } from "../db";
import { Button, Property } from "../form";
import Modal from "./block/Modal";
import { Integer, Node as Neo4jNode } from "neo4j-driver";
import { EPage, EPropertyType } from "../enums";
import { IPageProps } from "../interfaces";

interface INodeProps extends IPageProps {
    database: string;
    label: string;
    id: Integer | string;
}

interface INodeState {
    node: Neo4jNode | null;
    focus: string | null;
    labels: string[];
    properties: { name: string; key: string; value: any; type: EPropertyType }[];
    labelModal: boolean | string[];
    labelModalInput: string;
    error: string | null;
}

/**
 * Edit node by ID
 */
class Node extends React.Component<INodeProps, INodeState> {
    state: INodeState = {
        node: null,
        focus: null,
        labels: !!this.props.label ? [this.props.label] : [],
        properties: [],
        labelModal: false,
        labelModalInput: "",
        error: null,
    };

    hasElementId: boolean = this.props.id && !(this.props.id instanceof Integer);

    fnId = (name: string = "n"): string => {
        return this.hasElementId ? "elementId(" + name + ")" : "id(" + name + ")";
    };

    requestData = () => {
        if (!this.props.id) return;
        getDriver()
            .session({
                database: this.props.database,
                defaultAccessMode: neo4j.session.READ,
            })
            .run("MATCH (n) WHERE " + this.fnId() + " = $id RETURN n", {
                id: this.props.id,
            })
            .then(response => {
                if (response.records.length === 0) {
                    this.props.tabManager.close(this.props.tabId);
                    return;
                }

                const node = response.records[0].get("n");
                let props = [];
                const t = new Date().getTime();
                for (let key in node.properties) {
                    //resolve property type
                    let type = EPropertyType.String;
                    if (typeof node.properties[key] === "number") type = EPropertyType.Float;
                    else if (isInteger(node.properties[key])) type = EPropertyType.Integer;
                    else if (typeof node.properties[key] === "boolean") type = EPropertyType.Boolean;
                    props.push({ name: key + t, key: key, value: node.properties[key], type: type });
                }
                props.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
                this.setState({
                    node: node,
                    labels: [...node.labels],
                    properties: props,
                });
            })
            .catch(console.error);
    };

    componentDidMount() {
        this.requestData();
    }

    /**
     * Check if node still exists when switching on this tab
     */
    shouldComponentUpdate(nextProps, nextState, nextContext) {
        if (this.props.id && nextProps.active && this.props.active !== nextProps.active) {
            getDriver()
                .session({
                    database: this.props.database,
                    defaultAccessMode: neo4j.session.READ,
                })
                .run("MATCH (n) WHERE " + this.fnId() + " = $id RETURN COUNT(n) AS c", {
                    id: this.props.id,
                })
                .then(response => {
                    if (neo4j.integer.toNumber(response.records[0].get("c")) !== 1) {
                        this.props.tabManager.close(this.props.tabId);
                    }
                })
                .catch(console.error);
        }
        return true;
    }

    handlePropertyKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let props = [...this.state.properties];
        props.filter(p => "key." + p.name === e.currentTarget.name)[0].key = e.currentTarget.value;
        this.setState({
            properties: props,
            focus: e.currentTarget.name,
        });
    };

    handlePropertyValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let props = [...this.state.properties];
        let value: any = e.currentTarget.value;
        switch (props.filter(p => p.name === e.currentTarget.name)[0].type) {
            case EPropertyType.Boolean:
                value = e.currentTarget.checked;
                break;
            case EPropertyType.Integer:
                value = neo4j.int(e.currentTarget.valueAsNumber);
                break;
            case EPropertyType.Float:
                value = e.currentTarget.valueAsNumber;
                break;
        }
        props.filter(p => p.name === e.currentTarget.name)[0].value = value;
        this.setState({
            properties: props,
            focus: e.currentTarget.name,
        });
    };

    handlePropertyTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        let props = [...this.state.properties];
        const i = props.findIndex(p => "type." + p.name === e.currentTarget.name);
        props[i].type = EPropertyType[e.currentTarget.value];
        switch (props[i].type) {
            case EPropertyType.Boolean:
                props[i].value = !!props[i].value;
                break;
            case EPropertyType.Integer:
                props[i].value = props[i].value.length ? neo4j.int(props[i].value) : 0;
                break;
            case EPropertyType.Float:
                props[i].value = props[i].value.length ? parseFloat(props[i].value) : 0;
                break;
            case EPropertyType.String:
                props[i].value = props[i].value.toString();
                break;
        }
        this.setState({
            properties: props,
            focus: e.currentTarget.name,
        });
    };

    handlePropertyDelete = (name: string) => {
        this.state.properties.splice(
            this.state.properties.findIndex(p => p.name === name),
            1
        );
        this.setState({
            properties: this.state.properties,
        });
    };

    handlePropertyAdd = () => {
        const i = new Date().getTime().toString();
        this.state.properties.push({ name: i, key: "", value: "", type: EPropertyType.String });
        this.setState({
            properties: this.state.properties,
            focus: "key." + i,
        });
    };

    handleLabelOpenModal = () => {
        getDriver()
            .session({
                database: this.props.database,
                defaultAccessMode: neo4j.session.READ,
            })
            .run("MATCH (n) WITH DISTINCT labels(n) AS ll UNWIND ll AS l RETURN collect(DISTINCT l) AS c")
            .then(response => {
                this.setState({
                    labelModal: response.records[0].get("c").filter(l => this.state.labels.indexOf(l) === -1),
                });
            })
            .catch(console.error);
    };

    handleLabelSelect = (label: string) => {
        if (this.state.labels.indexOf(label) === -1) this.state.labels.push(label);
        this.setState({
            labels: this.state.labels,
            labelModal: false,
            labelModalInput: "",
        });
    };

    handleLabelDelete = (label: string) => {
        const i = this.state.labels.indexOf(label);
        if (i === -1) return;
        this.state.labels.splice(i, 1);
        this.setState({
            labels: this.state.labels,
        });
    };

    handleLabelModalClose = () => {
        this.setState({
            labelModal: false,
        });
    };

    handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const { query, props } = this.generateQuery();

        //todo log query somewhere? create log terminal?
        getDriver()
            .session({
                database: this.props.database,
                defaultAccessMode: neo4j.session.WRITE,
            })
            .run(query, {
                id: this.props.id,
                p: props,
            })
            .then(response => {
                if (response.summary.counters.containsUpdates()) {
                    this.props.toast(this.props.id ? "Node updated" : "Node created");
                }
                this.props.tabManager.close(this.props.tabId);
            })
            .catch(console.error);
    };

    generateQuery = (printable: boolean = false): { query: string; props: object } => {
        let setLabels = this.props.id ? this.state.labels.filter(l => this.state.node.labels.indexOf(l) === -1).join(":") : this.state.labels.join(":");
        if (setLabels.length > 0) setLabels = " SET n:" + setLabels;
        let removeLabels = this.props.id ? this.state.node.labels.filter(l => this.state.labels.indexOf(l) === -1).join(":") : "";
        if (removeLabels.length > 0) removeLabels = " REMOVE n:" + removeLabels;

        let props = {};
        for (let p of this.state.properties) props[p.key] = p.value;

        let query: string = "";
        if (printable) {
            if (this.props.id) query += "MATCH (n) WHERE " + this.fnId() + " = " + (this.hasElementId ? "'" + this.props.id + "'" : neo4j.integer.toString(this.props.id));
            else query += "CREATE (n)";
            query += setLabels + removeLabels;
            if (this.state.properties.length) {
                query += " SET = {";
                let s = [];
                for (let p of this.state.properties) {
                    switch (p.type) {
                        case EPropertyType.String:
                            s.push(p.key + " = '" + p.value + "'");
                            break;
                        case EPropertyType.Integer:
                            s.push(p.key + " = " + neo4j.integer.toString(p.value));
                            break;
                        default:
                            s.push(p.key + " = " + p.value.toString());
                    }
                }
                query += s.join(", ") + "}";
            }
        } else {
            query += (this.props.id ? "MATCH (n) WHERE " + this.fnId() + " = $id" : "CREATE (n)") + setLabels + removeLabels + " SET n = $p";
        }

        return { query: query, props: props };
    };

    render() {
        if (!this.props.active) return;
        document.title = this.props.tabName + " (db: " + this.props.database + ")";

        if (this.props.id && this.state.node === null) {
            return <span className="has-text-grey-light">Loading...</span>;
        }

        return (
            <>
                {Array.isArray(this.state.labelModal) && (
                    <Modal title="Add label" handleClose={this.handleLabelModalClose}>
                        <div className="buttons">
                            {this.state.labelModal.map(label => (
                                <Button text={label} color="is-link is-rounded" key={label} onClick={() => this.handleLabelSelect(label)} />
                            ))}
                        </div>
                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                this.handleLabelSelect(this.state.labelModalInput);
                                return true;
                            }}>
                            <label className="label">Or specify new one</label>
                            <div className="field is-grouped">
                                <div className="control is-expanded">
                                    <input
                                        autoFocus
                                        pattern="^[A-Za-z][A-Za-z_0-9]*$"
                                        required
                                        className="input"
                                        type="text"
                                        value={this.state.labelModalInput}
                                        onChange={e => this.setState({ labelModalInput: e.currentTarget.value })}
                                    />
                                </div>
                                <div className="control">
                                    <Button icon="fa-solid fa-check" type="submit" />
                                </div>
                            </div>
                        </form>
                    </Modal>
                )}

                <form onSubmit={this.handleSubmit}>
                    {this.props.id && (
                        <div className="columns">
                            <div className="column is-half-desktop">
                                <div className="field">
                                    <label className="label">identity</label>
                                    <div className="control">
                                        <input className="input" disabled type="text" value={neo4j.integer.toString(this.state.node.identity)} />
                                    </div>
                                </div>
                            </div>
                            <div className="column is-half-desktop">
                                {this.hasElementId && (
                                    <div className="field">
                                        <label className="label">elementId</label>
                                        <div className="control">
                                            <input className="input" disabled type="text" value={this.state.node.elementId} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <fieldset className="box">
                        <legend className="tag is-link is-light">
                            <i className="fa-solid fa-tags mr-2"></i>Labels
                        </legend>
                        <div className="buttons tags">
                            {this.state.labels.map(label => (
                                <span key={"label-" + label} className="tag is-link is-medium mr-3 is-rounded">
                                    <a
                                        className="has-text-white mr-1"
                                        onClick={() => this.props.tabManager.add(label, "fa-regular fa-circle", EPage.Label, { label: label, database: this.props.database })}>
                                        {label}
                                    </a>
                                    <button className="delete" onClick={() => this.handleLabelDelete(label)}></button>
                                </span>
                            ))}
                            <Button icon="fa-solid fa-plus" color="button tag is-medium" onClick={this.handleLabelOpenModal} />
                        </div>
                    </fieldset>

                    <fieldset className="box">
                        <legend className="tag is-link is-light">
                            <i className="fa-regular fa-rectangle-list mr-2"></i>Properties
                        </legend>
                        {this.state.properties.map(p => (
                            <Property
                                key={p.name}
                                name={p.name}
                                mapKey={p.key}
                                focus={this.state.focus}
                                value={p.value}
                                type={p.type}
                                onKeyChange={this.handlePropertyKeyChange}
                                onValueChange={this.handlePropertyValueChange}
                                onTypeChange={this.handlePropertyTypeChange}
                                onDelete={this.handlePropertyDelete}
                            />
                        ))}

                        <Button icon="fa-solid fa-plus" text="Add property" onClick={this.handlePropertyAdd} />
                    </fieldset>

                    <fieldset className="box">
                        <legend className="tag is-link is-light">
                            <i className="fa-solid fa-circle-nodes mr-2"></i>Relationships
                        </legend>
                        todo
                    </fieldset>

                    <div className="mb-3">
                        <span className="icon-text is-flex-wrap-nowrap">
                            <span className="icon">
                                <i className="fa-solid fa-terminal" aria-hidden="true"></i>
                            </span>
                            <span className="is-family-code">{this.generateQuery(true).query}</span>
                        </span>
                    </div>

                    <div className="field">
                        <div className="control buttons is-justify-content-flex-end">
                            <Button color="is-success" type="submit" icon="fa-solid fa-check" text="Execute" />
                            {this.props.id && <Button icon="fa-solid fa-refresh" text="Reload" onClick={this.requestData} />}
                            <Button icon="fa-solid fa-xmark" text="Close" onClick={e => this.props.tabManager.close(this.props.tabId, e)} />
                            {this.props.id && <Button icon="fa-regular fa-trash-can" color="is-danger" text="Delete" />} {/* todo modal to confirm > delete > close tab */}
                        </div>
                    </div>
                </form>
            </>
        );
    }
}

export default Node;