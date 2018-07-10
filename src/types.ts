export class EsoUIType {
    name: string;
    type: string;

    constructor(name: string, type?: string) {
        if (name.startsWith("[")) {
            let [, realName, realType] = name.match(/\[(.+)\|\#(.+)\]/);
            this.name = realName || name;
            this.type = realType || name;
        } else {
            this.name = name;
            this.type = type || name;
        }
    }
}

export class EsoUIArgument {
    name: string;
    type: EsoUIType;

    constructor(name: string, type: EsoUIType) {
        this.name = name;
        this.type = type;
    }
}

export class EsoUIFunction {
    private _name: string;
    private _access: EsoUIFunctionAccess;
    private _args: EsoUIArgument[];
    private _returns: EsoUIArgument[];
    private _variableReturns: boolean;

    constructor(name: string, access: EsoUIFunctionAccess = EsoUIFunctionAccess.PUBLIC) {
        this._name = name;
        this._access = access;
        this._args = null;
        this._returns = null;
        this._variableReturns = false;
    }

    addArgument(name: string, type?: string) {
        if(!this._args) {
            this._args = [];
        }
        this._args.push(new EsoUIArgument(name, new EsoUIType(type || "")));
    }

    addReturn(name: string, type?: string) {
        if(!this._returns) {
            this._returns = [];
        }
        this._returns.push(new EsoUIArgument(name, new EsoUIType(type || "")));
    }

    get name(): string {
        return this._name;
    }

    get access(): EsoUIFunctionAccess {
        return this._access;
    }

    get args(): EsoUIArgument[] {
        return this._args;
    }

    set args(args: EsoUIArgument[]) {
        this._args = args;
    }

    get returns(): EsoUIArgument[] {
        return this._returns;
    }

    set returns(returns: EsoUIArgument[]) {
        this._returns = returns;
    }

    get hasVariableReturns(): boolean {
        return this._variableReturns;
    }

    set hasVariableReturns(variableReturns: boolean) {
        this._variableReturns = variableReturns;
    }
}

export enum EsoUIFunctionAccess {
    PUBLIC = "public",
    PROTECTED = "protected",
    PROTECTED_ATTRIBUTES = "protected-attributes",
    PRIVATE = "private",
}

export const EsoUIFunctionAccessFromValue: { [key: string]: EsoUIFunctionAccess } = {};
Object.keys(EsoUIFunctionAccess).forEach(key => {
    let value = EsoUIFunctionAccess[key];
    EsoUIFunctionAccessFromValue[value.toString()] = value;
});

export class EsoUIObject {
    name: string;
    functions: Map<string, EsoUIFunction>;
    parent: EsoUIObject;
    children: EsoUIObject[];

    constructor(name: string) {
        this.name = name;
        this.functions = new Map<string, EsoUIFunction>();
        this.parent = null;
        this.children = [];
    }

    addFunction(data: EsoUIFunction) {
        this.functions.set(data.name, data);
    }
}

export class EsoUIEvent {
    name: string;
    args: EsoUIArgument[];

    constructor(name: string, args: EsoUIArgument[]) {
        this.name = name;
        this.args = args;
    }
}

export class EsoUIXMLElement {
    name: string;
    attributes: EsoUIArgument[];
    parent: EsoUIType;
    children: EsoUIType[];
    documentation: string;

    constructor(name: string) {
        this.name = name;
        this.attributes = [];
        this.parent = null;
        this.children = [];
        this.documentation = null;
    }
}

export class EsoUIDocumentation {
    apiVersion: number = 0;
    globals: Map<string, string[]> = new Map<string, string[]>();
    functions: Map<string, EsoUIFunction> = new Map<string, EsoUIFunction>();
    objects: Map<string, EsoUIObject> = new Map<string, EsoUIObject>();
    events: Map<string, EsoUIEvent> = new Map<string, EsoUIEvent>();
    xmlAttributes: Map<string, EsoUIArgument> = new Map<string, EsoUIArgument>();
    xmlLayout: Map<string, EsoUIXMLElement> = new Map<string, EsoUIXMLElement>();
}