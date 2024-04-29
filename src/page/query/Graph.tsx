import * as React from "react";
import { IEdgeBase, IEdgeStyle, INodeBase, INodeStyle, NodeShapeType, Orb, OrbEventType } from "@memgraph/orb";
import db from "../../db";
import { Node as _Node, Record, Relationship as _Relationship } from "neo4j-driver";
import { Button } from "../../components/form";
import orb_logo from "../../assets/orb_logo.png";
import { ITabManager } from "../../utils/interfaces";
import { settings } from "../../layout/Settings";
import NodeStyleModal from "./graph/NodeStyleModal";
import SidebarContent from "./graph/SidebarContent";

const COLORS = ['#604A0E', '#C990C0', '#F79767', '#57C7E3', '#F16667', '#D9C8AE', '#8DCC93', '#ECB5C9', '#4C8EDA', '#FFC454', '#DA7194', '#569480'];

interface MyNode extends INodeBase {
    id: string;
    label: string;
    element: _Node;
}

interface MyEdge extends IEdgeBase {
    id: string;
    label: string;
    start: any;
    end: any;
    element: _Relationship;
}

interface IStyle { [label: string]: { [key: string]: any } }

interface IGraphProps {
    rows: Record[];
    tabManager: ITabManager
}

interface IGraphState {
    sidebarVisible: number; // 1 - visible, 0 - hidden, 2 - animate in, 3 - animate out
    labels: { [key: string]: number }; // label: amount of nodes with it
    types: { [key: string]: number }; // type: amount of rels with it
    detail: _Node | _Relationship | null; // clicked node/rel to see details in sidebar
    nodeStyleModal: string|null;
    typeModal: string|null;
    nodeStyles: IStyle;
    edgeStyles: IStyle;
}

class Graph extends React.Component<IGraphProps, IGraphState> {
    state: IGraphState = {
        sidebarVisible: 1,
        labels: {},
        types: {},
        detail: null,
        nodeStyleModal: null,
        typeModal: null,
        nodeStyles: sessionStorage.getItem("nodeStyles") ? JSON.parse(sessionStorage.getItem("nodeStyles")) : {},
        edgeStyles: {}
    };

    graphContainer = React.createRef<HTMLDivElement>();
    graphElement = React.createRef<HTMLDivElement>();
    orb: Orb;

    componentDidMount() {
        this.initGraphView();
    }

    initGraphView = () => {
        const current = this.graphElement.current;
        if (!current) return;

        this.initializeOrb();

        const nodes: MyNode[] = [];
        const edges: MyEdge[] = [];
        const labels: { [key: string]: number } = {};
        const types: { [key: string]: number } = {};
        this.props.rows.forEach(row => {
            for (let key of row.keys) {
                const value = row.get(key);
                if (value instanceof _Node && !nodes.find(n => n.id === db.strInt(value.identity))) {
                    //prepare data for orb
                    nodes.push({
                        id: db.strInt(value.identity),
                        label: ":" + value.labels.join(":"),
                        element: value
                    });
                    //collect labels with counts
                    if (!(value.labels[0] in labels))
                        labels[value.labels[0]] = 0;
                    labels[value.labels[0]]++;
                } else if (value instanceof _Relationship && !edges.find(e => e.id === db.strInt(value.identity))) {
                    //prepare data for orb
                    edges.push({
                        id: db.strInt(value.identity),
                        start: db.strInt(value.start),
                        end: db.strInt(value.end),
                        label: ":" + value.type,
                        element: value
                    });
                    //collect type with count
                    if (!(value.type in types))
                        types[value.type] = 0;
                    types[value.type]++;
                }
            }
        });

        this.setState({
            labels: labels,
            types: types
        });

        this.orb.data.setup({ nodes, edges });

        //remove unused styles
        const tmpNodeStyles = {...this.state.nodeStyles};
        Object.keys(tmpNodeStyles).forEach(label => {
            if (!(label in labels))
                delete tmpNodeStyles[label];
        });
        //define missing styles for labels
        Object.keys(labels).forEach((label, i) => {
            if (!(label in tmpNodeStyles)) {
                tmpNodeStyles[label] = {
                    color: COLORS[i]
                };
            } else if (!('color' in tmpNodeStyles[label])) {
                tmpNodeStyles[label].color = COLORS[i];
            }
        });
        //apply label styles
        this.orb.data.getNodes().forEach(node => {
            node.style.color = tmpNodeStyles[node.data.element.labels[0]].color;
            if ('shape' in tmpNodeStyles[node.data.element.labels[0]])
                node.style.shape = tmpNodeStyles[node.data.element.labels[0]].shape;
            if ('size' in tmpNodeStyles[node.data.element.labels[0]])
                node.style.size = tmpNodeStyles[node.data.element.labels[0]].size;
            if ('fontSize' in tmpNodeStyles[node.data.element.labels[0]])
                node.style.fontSize = tmpNodeStyles[node.data.element.labels[0]].fontSize;

            if ('label' in tmpNodeStyles[node.data.element.labels[0]]) {
                if (tmpNodeStyles[node.data.element.labels[0]].label in node.data.element.properties)
                    node.style.label = node.data.element.properties[tmpNodeStyles[node.data.element.labels[0]].label];
                else if (tmpNodeStyles[node.data.element.labels[0]].label === '#id')
                    node.style.label = node.data.id;
                else
                    node.style.label = node.data.label;
            }
        });

        this.setState({
            nodeStyles: tmpNodeStyles
        });
        sessionStorage.setItem('nodeStyles', JSON.stringify(tmpNodeStyles))

        this.orb.view.setSettings({
            render: {
                shadowIsEnabled: false,
                shadowOnEventIsEnabled: true,
                contextAlphaOnEvent: 0.5
            }
        });
        this.orb.view.render(() => {
            this.orb.view.recenter();
        });
    };

    initializeOrb = () => {
        if (!this.orb) {
            this.orb = new Orb<MyNode, MyEdge>(this.graphElement.current);
            this.orb.data.setDefaultStyle({
                getNodeStyle(node): INodeStyle {
                    return {
                        size: 5,
                        color: '#1d87c9',
                        fontSize: 4,
                        fontColor: settings().darkMode ? 'white' : 'black',
                        shape: NodeShapeType.CIRCLE,
                        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
                        label: node.data.label,
                        shadowSize: 5,
                        shadowColor: 'black'
                    };
                },
                getEdgeStyle(edge): IEdgeStyle {
                    return {
                        color: '#ababab',
                        width: 0.3,
                        fontSize: 4,
                        arrowSize: 1,
                        fontColor: settings().darkMode ? 'white' : 'black',
                        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
                        label: edge.data.label,
                    };
                }
            });

            this.orb.events.on(OrbEventType.NODE_CLICK, event => {
                this.setState({
                    detail: event.node.data.element
                });
            });

            this.orb.events.on(OrbEventType.EDGE_CLICK, event => {
                this.setState({
                    detail: event.edge.data.element
                });
            });

            this.orb.events.on(OrbEventType.MOUSE_CLICK, event => {
                if (!event.subject) {
                    this.setState({
                        detail: null
                    });
                }
            })
        }
    }

    sidebarSwitchBtn = () => {
        if (this.state.sidebarVisible <= 1) {
            this.setState(state => {
                return { sidebarVisible: state.sidebarVisible === 1 ? 3 : 2 };
            });
        }
    }

    fullscreenSwitchBtn = () => {
        if (document.fullscreenElement === null) {
            this.graphContainer.current.requestFullscreen().then(() => {
                setTimeout(() => this.orb.view.recenter(), 100);
            });
        } else {
            document.exitFullscreen().then(() => {
                setTimeout(() => this.orb.view.recenter(), 100);
            });
        }
    }

    updateNodeStyle = (label: string, property: string, value: any) => {
        this.setState(state => {
            state.nodeStyles[label][property] = value;
            return state;
        }, () => {
            sessionStorage.setItem('nodeStyles', JSON.stringify(this.state.nodeStyles))
        });

        this.orb.data.getNodes().forEach(node => {
            if (node.data.element.labels[0] === label) {
                let tmpValue = value;
                if (property === 'label') {
                    if (value in node.data.element.properties)
                        tmpValue = node.data.element.properties[value];
                    else if (value === '#id')
                        tmpValue = node.data.id;
                    else
                        tmpValue = node.data.label;
                }
                node.style[property] = tmpValue;
            }
        });
        this.orb.view.render();
    }

    render() {
        return (
            <div className="graph-container is-flex" ref={this.graphContainer}>
                <div className={"graph " + (this.state.sidebarVisible > 0 ? "sidebar-visible" : "")} ref={this.graphElement}>
                    {/* canvas will be inserted here */}
                    <div className="sidebar-switch-btn">
                        <Button
                            icon={"fa-solid " + (this.state.sidebarVisible % 2 === 1 ? "fa-chevron-right" : "fa-chevron-left")}
                            color="ml-auto is-small"
                            onClick={this.sidebarSwitchBtn}
                        />
                    </div>
                </div>

                {this.state.sidebarVisible > 0 && (
                    <div className={"sidebar px-2 py-3 "
                        + (this.state.sidebarVisible === 3 ? "animate_out" : "")
                        + (this.state.sidebarVisible === 2 ? "animate_in" : "")
                        } onAnimationEnd={() => {
                            this.setState(state => {
                                return { sidebarVisible: state.sidebarVisible === 3 ? 0 : 1 };
                            });
                            setTimeout(() => this.orb.view.recenter(), 100);
                    }}>
                        <div className="header has-text-weight-bold mb-3">
                            {this.state.detail instanceof _Node ? "Node" : (this.state.detail instanceof _Relationship ? "Relationship" : "Overview")}
                        </div>
                        <div className="content">
                            <SidebarContent
                                detail={this.state.detail}
                                labels={this.state.labels}
                                types={this.state.types}
                                labelClick={(label: string) => this.setState({ nodeStyleModal: label })}
                                nodeStyles={this.state.nodeStyles}
                            />
                        </div>
                    </div>
                )}

                <div className="buttons">
                    {document.fullscreenEnabled && (
                        <Button
                            icon={"fa-solid " + (document.fullscreenElement === null ? "fa-expand" : "fa-compress")}
                            color="mr-0"
                            onClick={this.fullscreenSwitchBtn}
                            title="Fullscreen"
                        />
                    )}
                    <Button icon="fa-solid fa-maximize" onClick={() => this.orb.view.recenter()} color="mr-0" title="Recenter" />
                </div>

                <div className="brand is-flex is-align-items-center">
                    <span className="is-size-7">Powered by</span>
                    <a href="https://github.com/memgraph/orb" target="_blank" className="ml-1">
                        <img src={orb_logo} alt="ORB" />
                    </a>
                </div>

                {this.state.nodeStyleModal && <NodeStyleModal
                    label={this.state.nodeStyleModal}
                    currentSettings={this.state.nodeStyles[this.state.nodeStyleModal]}
                    handleClose={() => this.setState({nodeStyleModal: null})}
                    handleStyleSet={this.updateNodeStyle}
                    labelFields={
                        this.props.rows.map(record => {
                            for (const key of record.keys) {
                                const item = record.get(key);
                                if (item instanceof _Node && item.labels[0] === this.state.nodeStyleModal)
                                    return Object.keys(item.properties);
                            }
                        })[0]
                    }
                />}
            </div>
        );
    }
}

export default Graph;
export { COLORS };
export type { IStyle };
