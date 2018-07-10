import { DOMParser, XMLSerializer } from "xmldom";
import { readFileSync, createWriteStream, WriteStream } from "fs";
import { EsoUIDocumentation, EsoUIXMLElement, EsoUIArgument, EsoUIType } from "./types";
import { sep } from "path";

const INDENT: string = "    ";
const EOL: string = "\n";

const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;

interface EsoUIEnumTypeData {
    name: string;
    values: string[];
}

export class EsoUIXMLXsdGenerator {
    config: any;
    version: number;
    layout: Map<string, EsoUIXMLElement>;
    globals: Map<string, string[]>;
    definedElements: Map<string, boolean>;
    usedAttributeTypes: Map<string, boolean>;
    document: XMLDocument;
    sectionOutput: any[];
    output: any[];

    constructor(documentation: EsoUIDocumentation) {
        this.version = documentation.apiVersion;
        this.layout = documentation.xmlLayout;
        this.globals = documentation.globals;

        let config = readFileSync("xsdConfig.json");
        this.config = JSON.parse(config.toString());
    }

    appendChild(node: Element, child: Element, indent = 1) {
        switch (child.nodeType) {
            case ELEMENT_NODE:
            case COMMENT_NODE:
                node.appendChild(this.createIndent(indent));
                node.appendChild(child);
                if (child.childNodes && child.childNodes.length > 0) {
                    child.insertBefore(this.createLineBreak(), child.firstChild);
                    child.appendChild(this.createIndent(indent));
                }
                node.appendChild(this.createLineBreak());
                break;
            default:
                node.appendChild(child);
        }
    }

    createIndent(level: number) {
        return this.document.createTextNode(INDENT.repeat(level));
    }

    createLineBreak(num = 1) {
        return this.document.createTextNode(EOL.repeat(num));
    }

    createXmlElement(name: string, type: string): Element {
        let node = this.document.createElement("xs:element");
        name = this.config.elementNameRename[name] || name;
        node.setAttribute("name", name);
        node.setAttribute("type", type);
        return node;
    }

    appendAllAttributes(parent: Element, attributes: EsoUIArgument[], indent: number) {
        if (attributes) {
            attributes.forEach(attributeData => {
                let type = this.config.attributeTypeRename[attributeData.type.type] || attributeData.type.type;
                let attributeElement = this.document.createElement("xs:attribute");
                attributeElement.setAttribute("name", attributeData.name);
                attributeElement.setAttribute("type", type);
                this.appendChild(parent, attributeElement, indent);
            });
        }
    }

    createComplexType(nodeData: EsoUIXMLElement, nameOverride?: string): Element {
        let typeElement = this.document.createElement("xs:complexType");
        typeElement.setAttribute("name", nameOverride || nodeData.name);
        if (nodeData.children) {
            let choiceElement = this.document.createElement("xs:choice");
            choiceElement.setAttribute("minOccurs", "0");
            choiceElement.setAttribute("maxOccurs", "unbounded");

            nodeData.children.forEach(childData => {
                if (!this.config.ignoredChildElements[childData.name]) {
                    let childElement = this.createXmlElement(childData.name, childData.type);
                    this.appendChild(choiceElement, childElement, 3);
                }
            });

            if (choiceElement.childNodes.length > 0) {
                this.appendChild(typeElement, choiceElement, 2);
            }
        }

        this.appendAllAttributes(typeElement, nodeData.attributes, 2);
        return typeElement;
    }

    createComplexSimpleType(nodeData: EsoUIXMLElement): Element {
        let extensionElement = this.document.createElement("xs:extension");
        extensionElement.setAttribute("base", "xs:string");

        this.appendAllAttributes(extensionElement, nodeData.attributes, 4);

        let contentElement = this.document.createElement("xs:simpleContent");
        this.appendChild(contentElement, extensionElement, 3);

        let typeElement = this.document.createElement("xs:complexType");
        typeElement.setAttribute("name", nodeData.name);
        this.appendChild(typeElement, contentElement, 2);

        return typeElement;
    }

    appendDocumentation(parent: Element, text: string, indent: number) {
        let annotationElement = this.document.createElement("xs:annotation");
        let documentationElement = this.document.createElement("xs:documentation");
        documentationElement.appendChild(this.document.createTextNode(INDENT.repeat(indent + 2) + text + "\n"));
        this.appendChild(annotationElement, documentationElement, indent + 1);
        this.appendChild(parent, annotationElement, indent);
    }

    createComplexExtensionType(nodeData: EsoUIXMLElement, parentTypeOverride?: string): Element {
        let parentType = parentTypeOverride || nodeData.parent.type;

        let typeElement = this.document.createElement("xs:complexType");
        typeElement.setAttribute("name", nodeData.name);

        let extensionElement = this.document.createElement("xs:extension");
        extensionElement.setAttribute("base", parentType);

        if (nodeData.documentation) {
            this.appendDocumentation(typeElement, nodeData.documentation, 2);
        } else {
            let choiceElement = this.document.createElement("xs:choice");
            choiceElement.setAttribute("minOccurs", "0");
            choiceElement.setAttribute("maxOccurs", "unbounded");
            if (parentType) {
                let groupElement = this.document.createElement("xs:group");
                groupElement.setAttribute("ref", parentType + "Elements");
                this.appendChild(choiceElement, groupElement, 5);
            }
            if (nodeData.children) {
                nodeData.children.forEach(childData => {
                    if (!this.definedElements.has(childData.name)) {
                        let childElement = this.createXmlElement(childData.name, childData.type);
                        this.appendChild(choiceElement, childElement, 5);
                    }
                });
            }

            if (choiceElement.childNodes.length > 0) {
                this.appendChild(extensionElement, choiceElement, 4);
            }
        }

        this.appendAllAttributes(extensionElement, nodeData.attributes, 4);

        let contentElement = this.document.createElement(nodeData.documentation ? "xs:simpleContent" : "xs:complexContent");
        this.appendChild(contentElement, extensionElement, 3);
        this.appendChild(typeElement, contentElement, 2);
        return typeElement;
    }

    createEnumType(name: string, enumValues: string[]): Element {
        let prefix = this.config.enumPrefixes[name];

        let typeElement = this.document.createElement("xs:simpleType");
        typeElement.setAttribute("name", name);
        let unionElement = this.document.createElement("xs:union");

        let integerTypeElement = this.document.createElement("xs:simpleType");
        let integerRestrictionElement = this.document.createElement("xs:restriction");
        integerRestrictionElement.setAttribute("base", "integer");

        let enumTypeElement = this.document.createElement("xs:simpleType");
        let enumRestrictionElement = this.document.createElement("xs:restriction");
        enumRestrictionElement.setAttribute("base", "xs:string");
        enumValues.forEach(value => {
            let enumValueElement = this.document.createElement("xs:enumeration");

            if (prefix) {
                value = value.substring(prefix.length, value.length);
            }
            enumValueElement.setAttribute("value", value);

            this.appendChild(enumRestrictionElement, enumValueElement, 5);
        })

        this.appendChild(integerTypeElement, integerRestrictionElement, 4);
        this.appendChild(enumTypeElement, enumRestrictionElement, 4);
        this.appendChild(unionElement, integerTypeElement, 3);
        this.appendChild(unionElement, enumTypeElement, 3);
        this.appendChild(typeElement, unionElement, 2);
        return typeElement;
    }

    createElementGroup(children: EsoUIType[], name: string): Element {
        let choiceElement = this.document.createElement("xs:choice");
        children.forEach(childData => {
            let childElement = this.createXmlElement(childData.name, childData.type);
            this.appendChild(choiceElement, childElement, 3);
        })

        let groupElement = this.document.createElement("xs:group");
        groupElement.setAttribute("name", name);
        this.appendChild(groupElement, choiceElement, 2);
        return groupElement;
    }

    findRemainingElementTypes(layout: Map<string, EsoUIXMLElement>): [string[], Map<string, EsoUIXMLElement[]>, EsoUIXMLElement[]] {
        let subTypes: Map<string, EsoUIXMLElement[]> = new Map<string, EsoUIXMLElement[]>();
        let basicTypes: EsoUIXMLElement[] = [];

        layout.forEach((data, key) => {
            if (!this.definedElements.has(key)) {
                if (data.parent) {
                    let type = data.parent.type;
                    if (!subTypes.has(type)) {
                        subTypes.set(type, []);
                    }
                    subTypes.get(type).push(data);
                } else {
                    basicTypes.push(data);
                }
            }
        });

        let baseTypes: string[] = [...subTypes.keys()];
        baseTypes.sort();

        return [baseTypes, subTypes, basicTypes];
    }

    createSection(output: any[], title: string) {
        output.push(this.createLineBreak());
        output.push(this.document.createComment(` ${title} `));
    }

    createRootNode(output: any[], nodeData: EsoUIXMLElement) {
        output.push(this.createComplexType(nodeData, nodeData.name + "Type"));
        output.push(this.createLineBreak());
        output.push(this.createXmlElement(nodeData.name, nodeData.name + "Type"));
    }

    createComplexTypeNode(output: any[], nodeData: any) {
        output.push(this.createLineBreak());
        output.push(this.createComplexType(nodeData));
    }

    createComplexBaseTypeNode(output: any[], nodeData: EsoUIXMLElement) {
        output.push(this.createLineBreak());
        output.push(this.createElementGroup(nodeData.children, nodeData.name + "TypeElements"));
        output.push(this.createLineBreak());
        let typeElement = new EsoUIXMLElement(nodeData.name + "Type");
        typeElement.attributes = nodeData.attributes;
        output.push(this.createComplexType(typeElement));
        output.push(this.createLineBreak());
        let emptyElement = new EsoUIXMLElement(nodeData.name);
        output.push(this.createComplexExtensionType(emptyElement, nodeData.name + "Type"));
    }

    createComplexSimpleTypeNode(output: any[], nodeData: EsoUIXMLElement) {
        output.push(this.createLineBreak());
        output.push(this.createComplexSimpleType(nodeData));
    }

    createComplexExtensionTypeNode(output: any[], nodeData: EsoUIXMLElement) {
        let parentType = this.config.parentTypeRename[nodeData.parent.type] || nodeData.parent.type;
        output.push(this.createLineBreak());
        output.push(this.createComplexExtensionType(nodeData, parentType));
    }

    createEnumTypeNode(output: any[], nodeData: EsoUIEnumTypeData) {
        let name = this.config.attributeTypeRename[nodeData.name] || nodeData.name;
        output.push(this.createLineBreak());
        output.push(this.createEnumType(name, nodeData.values));
    }

    initializeDocument() {
        this.sectionOutput = [];
        this.output = [];

        let template = readFileSync(this.config.templateFile);
        let parser = new DOMParser();
        this.document = parser.parseFromString(template.toString(), "application/xml");
    }

    finalizeDocument() {
        let rootNode = this.document.getElementsByTagName("xs:schema")[0];
        let elements = [];
        this.output.forEach(node => {
            node.factory.call(this, elements, node.data)
            elements.forEach(element => {
                this.appendChild(rootNode, element);
            });
            elements.length = 0;
        });
    }

    initializeDefinedElements() {
        this.usedAttributeTypes = new Map<string, boolean>();
        this.definedElements = new Map<string, boolean>();
        Object.keys(this.config.ignoredElements).forEach(name => {
            this.definedElements.set(name, true);
        });
    }

    setElementDefined(data: EsoUIXMLElement) {
        this.setAllUsedAttributes(data);
        this.definedElements.set(data.name, true);
    }

    setAllUsedAttributes(data: EsoUIXMLElement) {
        if (data.attributes) {
            data.attributes.forEach(attributeData => {
                this.usedAttributeTypes[attributeData.type.type] = true;
            });
        }
    }

    startSection(title: string) {
        this.sectionOutput.length = 0;
        this.addNode(this.createSection, title);
    }

    endSection() {
        this.output = this.sectionOutput.concat(this.output);
    }

    addNode(factory: Function, data: any) {
        this.sectionOutput.push({
            factory: factory,
            data: data
        });
    }

    createElementSectionNodes(elements: string[], getFactory: Function) {
        elements.forEach(element => {
            if (this.layout.has(element)) {
                let data = this.layout.get(element);
                this.addNode(getFactory(data), data);
                this.setElementDefined(data);
            }
        });
    }

    createTypeSectionNodes(types: EsoUIXMLElement[], factory: Function) {
        types.forEach(data => {
            if (!this.definedElements.has(data.name)) {
                this.addNode(factory, data);
                this.setAllUsedAttributes(data);
            }
        });
    }

    createAttributeSectionNodes(attributeTypes: Map<string, boolean>, factory: Function) {
        let usedAttributeTypes = Object.keys(attributeTypes);
        usedAttributeTypes.sort().forEach(name => {
            if (this.globals.has(name)) {
                let nodeData: EsoUIEnumTypeData = {
                    name: name,
                    values: this.globals.get(name)
                };
                this.addNode(factory, nodeData);
            }
        });
    }

    createWriter(fileName): WriteStream {
        return createWriteStream(fileName, {
            flags: "w+"
        });
    }

    generate(outputDir: string) {
        this.initializeDefinedElements();
        this.initializeDocument();

        this.startSection("root element");
        let data = this.layout.get("GuiXml");
        this.addNode(this.createRootNode, data);
        this.setElementDefined(data);
        this.endSection();

        this.startSection("container elements");
        this.createElementSectionNodes(this.config.containers, data => this.createComplexTypeNode);
        this.endSection();

        this.startSection("other elements");
        this.createElementSectionNodes(this.config.others, data => this.createComplexTypeNode);
        this.endSection();

        let [baseTypes, subTypes, basicTypes] = this.findRemainingElementTypes(this.layout);

        this.startSection("element basetypes");
        this.createElementSectionNodes(baseTypes, data => (data.children && data.children.length > 0) ? this.createComplexBaseTypeNode : this.createComplexSimpleTypeNode);
        this.endSection();

        this.startSection("element types");
        baseTypes.forEach(baseType => {
            this.addNode(this.createSection, `${baseType} element types`);
            this.createTypeSectionNodes(subTypes.get(baseType), this.createComplexExtensionTypeNode);
        });
        this.endSection();

        this.startSection("basic element types");
        this.createTypeSectionNodes(basicTypes, this.createComplexTypeNode);
        this.endSection();

        this.startSection("basic attribute types");
        this.createAttributeSectionNodes(this.usedAttributeTypes, this.createEnumTypeNode);
        this.endSection();

        this.finalizeDocument();

        let xsdFile = `${outputDir}${sep}esoui${this.version}.xsd`;
        console.log("write xsd file", xsdFile);
        const writer = this.createWriter(xsdFile);
        const serializer = new XMLSerializer();
        writer.write(serializer.serializeToString(this.document));
        writer.end();
    }
}