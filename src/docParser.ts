import { createInterface } from "readline";
import { createReadStream } from "fs";
import { EsoUIType, EsoUIArgument, EsoUIFunction, EsoUIFunctionAccessFromValue, EsoUIObject, EsoUIEvent, EsoUIXMLElement, EsoUIDocumentation } from "./types";

enum ReaderState {
    UNDETERMINED,
    READ_API_VERSION,
    READ_VM_FUNCTIONS,
    READ_GLOBALS,
    READ_GAME_API,
    READ_OBJECT_API,
    READ_EVENTS,
    READ_XML_LAYOUT,
    READ_XML_ATTRIBUTES
}

export class EsoUIDocumentationParser {
    data: EsoUIDocumentation;
    fileName: string;
    currentLine: string;
    currentEnum: string[];
    currentFunction: EsoUIFunction;
    currentObject: EsoUIObject;
    currentElement: EsoUIXMLElement;
    state: ReaderState;

    lineStartsWith(prefix: string): boolean {
        return this.currentLine.startsWith(prefix);
    }

    lineEndsWith(suffix: string): boolean {
        return this.currentLine.endsWith(suffix);
    }

    getFirstMatch(pattern: RegExp): string {
        var matches = this.currentLine.match(pattern);
        if (matches.length >= 1) {
            return matches[1];
        } else {
            throw new Error(`No matches for pattern "${pattern}" in line "${this.currentLine}".`);
        }
    }

    getMatches(pattern: RegExp): string[] {
        var matches = this.currentLine.match(pattern);
        matches.shift();
        return matches;
    }

    findNextState(): ReaderState {
        if (this.lineStartsWith("{TOC:maxLevel")) {
            return ReaderState.READ_API_VERSION;
        } else if (this.lineStartsWith("h2. VM Functions")) {
            return ReaderState.READ_VM_FUNCTIONS;
        } else if (this.lineStartsWith("h2. Global Variables")) {
            return ReaderState.READ_GLOBALS;
        } else if (this.lineStartsWith("h2. Game API")) {
            return ReaderState.READ_GAME_API;
        } else if (this.lineStartsWith("h2. Object API")) {
            return ReaderState.READ_OBJECT_API;
        } else if (this.lineStartsWith("h2. Events")) {
            return ReaderState.READ_EVENTS;
        } else if (this.lineStartsWith("h2. UI XML Layout")) {
            return ReaderState.READ_XML_ATTRIBUTES;
        } else if (this.state === ReaderState.READ_XML_ATTRIBUTES) {
            return ReaderState.READ_XML_LAYOUT;
        } else {
            return ReaderState.UNDETERMINED;
        }
    }

    readApiVersion(): boolean {
        if (this.lineStartsWith("h1. ")) {
            this.data.apiVersion = parseInt(this.getFirstMatch(/(\d+)$/));
            return true;
        }
        return false;
    }

    getOrCreateGlobal(name: string): string[] {
        if (!this.data.globals.has(name)) {
            this.data.globals.set(name, []);
        }
        return this.data.globals.get(name);
    }

    readGlobals(): boolean {
        if (this.lineStartsWith("h2. ")) {
            // section ended
            return true
        }

        if (this.lineStartsWith("h5. ")) {
            let enumName = this.getFirstMatch(/h5\.\ (.+)$/);
            this.currentEnum = this.getOrCreateGlobal(enumName);
        } else if (this.lineStartsWith("* ")) {
            let enumValue = this.getFirstMatch(/\*\ (.+)$/);
            this.currentEnum.push(enumValue);
        }
        return false;
    }

    parseArgs(args: string): EsoUIArgument[] {
        let data = [];
        let argsArray = args.split(",");
        argsArray.forEach(arg => {
            let [, type, name] = arg.match(/\*(.+)\* _(.+)_/);
            data.push(new EsoUIArgument(name, new EsoUIType(type)));
        });
        return data;
    }

    readGameApi(): boolean {
        if (this.lineStartsWith("h2. ")) {
            // section ended
            return true
        }

        this.readFunction(this.data.functions);
        return false;
    }

    readFunction(functions: Map<string, EsoUIFunction>) {
        if (this.lineStartsWith("* ")) {
            let [functionName, args] = this.getMatches(/^\*\ (.+)\((.*)\)$/);
            let [, name, , access] = functionName.match(/([^\s]+)( \*(.+)\*)?/);

            this.currentFunction = new EsoUIFunction(name, EsoUIFunctionAccessFromValue[access]);
            if (args) {
                this.currentFunction.args = this.parseArgs(args);
            }
            functions.set(name, this.currentFunction);
        } else if (this.lineStartsWith("** _Uses variable returns")) {
            this.currentFunction.hasVariableReturns = true;
        } else if (this.lineStartsWith("** _Returns:_")) {
            let args = this.getFirstMatch(/\*\*\ _Returns:_ (.+)$/);
            this.currentFunction.returns = this.parseArgs(args);
        }
    }

    getOrCreateObject(name: string) {
        if (!this.data.objects.has(name)) {
            this.data.objects.set(name, new EsoUIObject(name));
        }
        return this.data.objects.get(name);
    }

    readObjectApi() {
        if (this.lineStartsWith("h2. ")) {
            // section ended
            return true
        }

        if (this.lineStartsWith("h3. ")) {
            let objectName = this.getFirstMatch(/h3. (.+)$/);
            this.currentObject = this.getOrCreateObject(objectName);
        } else if (this.lineStartsWith("[")) {
            let types = this.currentLine.split(", ");
            types.forEach(typeName => {
                let type = new EsoUIType(typeName);
                let child = this.getOrCreateObject(type.type);
                this.currentObject.children.push(child);
                child.parent = this.currentObject;
            });
        } else if (this.currentObject && this.currentLine !== "") {
            this.readFunction(this.currentObject.functions);
        }
    }

    readEvents() {
        if (this.lineStartsWith("h2. ")) {
            // section ended
            return true
        }

        if (this.lineStartsWith("* ")) {
            let [name, , argsString] = this.getMatches(/^\*\ ([^\s]+)(\s\((.+)\))?/);

            let args = null;
            if (argsString) {
                args = this.parseArgs(argsString);
            }

            this.data.events.set(name, new EsoUIEvent(name, args));
        }
        return false;
    }

    readXmlAttributes() {
        if (this.lineStartsWith("h4. Attributes")) {
            // ignore the header
            return false
        } else if (!this.lineStartsWith("* ")) {
            // section ended
            return true
        }

        let [name, type] = this.getMatches(/^\*\ (.+) \*(.+)\*$/);
        this.data.xmlAttributes.set(name, new EsoUIArgument(name, new EsoUIType(type)));
        return false;
    }

    getOrCreateElement(name: string) {
        if (!this.data.xmlLayout.has(name)) {
            this.data.xmlLayout.set(name, new EsoUIXMLElement(name));
        }
        return this.data.xmlLayout.get(name);
    }

    readXmlLayout() {
        if (this.lineStartsWith("h5. sentinel_element")) {
            // section ended
            return true
        }

        if (this.lineStartsWith("h5. ")) {
            let elementName = this.getFirstMatch(/h5. (.+)$/);
            this.currentElement = this.getOrCreateElement(elementName);
        } else if (this.lineStartsWith("* _attr")) {
            let attribute = this.getFirstMatch(/\* _attribute:_ (.+)$/);
            let [, type, name] = attribute.match(/\*(.+)\* _(.+)_/);
            this.currentElement.attributes.push(new EsoUIArgument(name, new EsoUIType(type)));
        } else if (this.lineStartsWith("* ScriptArguments")) {
            this.currentElement.documentation = this.getFirstMatch(/\* ScriptArguments: (.+)$/);
        } else if (this.lineStartsWith("* [")) {
            let [lineType, name, type] = this.getMatches(/^\*\ \[(.+): (.+)\|#(.+)\]$/);
            switch (lineType) {
                case "Child":
                    if (type === "Attributes") {
                        this.currentElement.attributes.push(this.data.xmlAttributes.get(name));
                    } else {
                        this.currentElement.children.push(new EsoUIType(name, type));
                    }
                    break;
                case "Inherits":
                    this.currentElement.parent = new EsoUIType(type);
                    break;
                default:
                    console.warn("unhandled prefix", lineType, this.currentLine);
            }
        }
        return false;
    }

    onReadLine(line: string) {
        this.currentLine = line;
        let finished = false;

        switch (this.state) {
            case ReaderState.READ_API_VERSION:
                finished = this.readApiVersion();
                break;
            case ReaderState.READ_GLOBALS:
                finished = this.readGlobals();
                break;
            case ReaderState.READ_VM_FUNCTIONS:
            case ReaderState.READ_GAME_API:
                finished = this.readGameApi();
                break;
            case ReaderState.READ_OBJECT_API:
                finished = this.readObjectApi();
                break;
            case ReaderState.READ_EVENTS:
                finished = this.readEvents();
                break;
            case ReaderState.READ_XML_ATTRIBUTES:
                finished = this.readXmlAttributes();
                break;
            case ReaderState.READ_XML_LAYOUT:
                finished = this.readXmlLayout();
                break;
            case ReaderState.UNDETERMINED:
            default:
                this.state = this.findNextState();
        }

        if (finished) {
            this.state = this.findNextState();
            this.currentEnum = null;
            this.currentFunction = null;
            this.currentObject = null;
            this.currentElement = null;
        }
    }

    injectCustomData() {
        let registerForEvent = new EsoUIFunction("RegisterForEvent");
        registerForEvent.addArgument("namespace", "string");
        registerForEvent.addArgument("event", "integer");
        registerForEvent.addArgument("callback", "function");
        registerForEvent.addReturn("success", "bool");

        let unregisterForEvent = new EsoUIFunction("UnregisterForEvent");
        unregisterForEvent.addArgument("namespace", "string");
        unregisterForEvent.addArgument("event", "integer");
        unregisterForEvent.addReturn("success", "bool");

        let addFilterForEvent = new EsoUIFunction("AddFilterForEvent");
        addFilterForEvent.addArgument("namespace", "string");
        addFilterForEvent.addArgument("event", "integer");
        addFilterForEvent.addArgument("filterType", "RegisterForEventFilterType");
        addFilterForEvent.addArgument("filterValue");
        addFilterForEvent.addArgument("...");
        addFilterForEvent.addReturn("success", "bool");

        let registerForUpdate = new EsoUIFunction("RegisterForUpdate");
        registerForUpdate.addArgument("namespace", "string");
        registerForUpdate.addArgument("interval", "integer");
        registerForUpdate.addArgument("callback", "function");
        registerForUpdate.addReturn("success", "bool");

        let unregisterForUpdate = new EsoUIFunction("UnregisterForUpdate");
        unregisterForUpdate.addArgument("namespace", "string");
        unregisterForUpdate.addReturn("success", "bool");

        let eventManager = new EsoUIObject("EventManager");
        eventManager.addFunction(registerForEvent);
        eventManager.addFunction(unregisterForEvent);
        eventManager.addFunction(addFilterForEvent);
        eventManager.addFunction(registerForUpdate);
        eventManager.addFunction(unregisterForUpdate);

        let getWindowManager = new EsoUIFunction("GetWindowManager");
        getWindowManager.addReturn("windowManager", "WindowManager");

        let getAnimationManager = new EsoUIFunction("GetAnimationManager");
        getAnimationManager.addReturn("animationManager", "AnimationManager");

        let getEventManager = new EsoUIFunction("GetEventManager");
        getEventManager.addReturn("eventManager", "EventManager");

        let getAddOnManager = new EsoUIFunction("GetAddOnManager");
        getAddOnManager.addReturn("addOnManager", "AddOnManager");

        this.data.objects.set(eventManager.name, eventManager);
        this.data.functions.set(getWindowManager.name, getWindowManager);
        this.data.functions.set(getAnimationManager.name, getAnimationManager);
        this.data.functions.set(getEventManager.name, getEventManager);
        this.data.functions.set(getAddOnManager.name, getAddOnManager);
    }

    parseFile(resolve: Function, reject: Function) {
        this.data = new EsoUIDocumentation();
        this.injectCustomData();
        this.state = ReaderState.UNDETERMINED;

        let reader = createInterface({
            input: createReadStream(this.fileName),
            crlfDelay: Infinity
        });

        reader.on("line", (line) => this.onReadLine(line));
        reader.on("close", () => resolve(this.data));
    }

    parse(fileName: string) {
        this.fileName = fileName;
        return new Promise(this.parseFile.bind(this));
    }
}