import { createWriteStream, WriteStream, unlinkSync, readdirSync, statSync, rmdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmdir } from "fs";
import { EsoUIDocumentation, EsoUIArgument, EsoUIFunction, EsoUIObject, EsoUIEvent } from "./types";
import { sep } from "path";
import * as archiver from "archiver";

const INDENT: string = "    ";
const EOL: string = "\r\n";
const TEMP_DIR: string = "temp";
const TEMPLATE_DIR: string = "template";

export class EsoUILuaEEGenerator {
    documentation: EsoUIDocumentation;
    writer: WriteStream;

    constructor(documentation: EsoUIDocumentation) {
        this.documentation = documentation;
    }

    createIndent(level: number): string {
        return INDENT.repeat(level);
    }

    createLineBreak(num = 1): string {
        return EOL.repeat(num);
    }

    createWriter(fileName: string, flags: string) {
        this.writer = createWriteStream(fileName, {
            flags: flags
        })
        this.writer.cork();
    }

    finalizeWriter() {
        this.writeLine("return nil");
        this.writer.uncork();
        this.writer.end();
    }

    writeLine(line: string, indent: number = 0) {
        line = this.createIndent(indent) + line + this.createLineBreak();
        this.writer.write(line);
    }

    startSection() {
        this.writeLine("-------------------------------------------------------------------------------");
    }

    endSection() {
        this.writeLine("");
    }

    writeGlobalType(type: string) {
        this.startSection();
        this.writeLine(`-- ${type} type.`);
        this.writeLine(`-- @type ${type}`);
        this.endSection();
    }

    writeGlobalField(name: string, type: string, value: string) {
        this.startSection();
        this.writeLine(`-- \`${name}\` = ${value}`);
        this.writeLine(`-- This is a global variable which holds one of the possible values for @{${type}}.`);
        this.writeLine(`-- @field[parent=#globals] #${type} ${name}`);
        this.endSection();
    }

    writeGlobals() {
        this.startSection();
        this.writeLine(`-- @module globals`);
        this.endSection();

        let globals = this.documentation.globals;
        globals.forEach((values: string[], type: string) => {
            this.writeGlobalType(type);
            values.forEach(name => {
                let value = "unknown"; // TODO: add value from ingame dump
                this.writeGlobalField(name, type, value);
            })
        });
    }

    writeArguments(args: EsoUIArgument[]) {
        args.forEach(arg => {
            this.writeLine(`-- @param #${arg.type.type} ${arg.name}`);
        });
    }

    writeReturns(returns: EsoUIArgument[]) {
        returns.forEach(ret => {
            this.writeLine(`-- @return ${ret.type.type}#${ret.type.type} ${ret.name}`);
        });
    }

    writeFunction(data: EsoUIFunction, parent: string = "global") {
        this.startSection();
        this.writeLine(`-- ${data.access} \`${data.name}\``);
        if (data.hasVariableReturns) {
            this.writeLine(`-- This function uses variable return values.`);
        }
        this.writeLine(`-- @function [parent=#${parent}] ${data.name}`);
        if (parent !== "global") {
            this.writeLine(`-- @param #${parent} self`);
        }
        if (data.args) {
            this.writeArguments(data.args);
        }
        if (data.returns) {
            this.writeReturns(data.returns);
        }
        this.endSection();
    }

    writeGameApi() {
        let api = this.documentation.functions;
        api.forEach(func => {
            this.writeFunction(func);
        });
    }

    writeEvent(event: EsoUIEvent) {
        let value = "unknown"; // TODO: add value from ingame dump

        this.startSection();
        this.writeLine(`-- \`${event.name}\` = ${value}`);
        this.writeLine(`-- `);
        this.writeLine("-- This is one of the available event types which can be used with the @{EVENT_MANAGER}.");
        this.writeLine(`-- <b>Callback Parameters</b>`);
        this.writeLine(`-- <ul>`);
        this.writeLine("-- <li>#Event eventType</li>");
        if(event.args) {
            event.args.forEach(arg => {
                this.writeLine(`-- <li>#${arg.type.type} ${arg.name}</li>`);
            });
        }
        this.writeLine(`-- </ul>`);
        this.writeLine(`-- @field[parent=#global] #Event ${event.name}`);
        this.endSection();
    }

    writeEvents() {
        let events = this.documentation.events;
        events.forEach(event => {
            this.writeEvent(event);
        });
    }

    writeObject(object: EsoUIObject) {
        this.startSection();
        this.writeLine(`-- @module ${object.name}`);
        if (object.parent) {
            this.writeLine(`-- @extends ${object.parent.name}#${object.parent.name}`);
        }
        this.endSection();

        let functions = object.functions;
        functions.forEach(func => {
            this.writeFunction(func, object.name);
        });
    }

    tryCreatePath(path: string): boolean {
        try {
            mkdirSync(path);
            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
        return false;
    }

    clearPath(path: string) {
        let content = readdirSync(path);
        content.forEach(child => {
            let childPath = `${path}${sep}${child}`;
            if (statSync(childPath).isDirectory()) {
                console.log("enter", childPath);
                this.clearPath(childPath);
                console.log("rmdir", childPath);
                rmdirSync(childPath);
            } else {
                console.log("unlink", childPath);
                unlinkSync(childPath);
            }
        });
    }

    copyAllFiles(sourcePath: string, targetPath: string) {
        console.log(`copy all files in "${sourcePath}${sep}" to "${targetPath}${sep}"`);
        this.tryCreatePath(targetPath);

        let content = readdirSync(sourcePath);
        content.forEach(child => {
            let sourceChildPath = `${sourcePath}${sep}${child}`;
            let targetChildPath = `${targetPath}${sep}${child}`;
            console.log(`copy "${sourceChildPath}" to "${targetChildPath}"`);
            if (statSync(sourceChildPath).isDirectory()) {
                this.copyAllFiles(sourceChildPath, targetChildPath);
            } else {
                copyFileSync(sourceChildPath, targetChildPath);
            }
        });
    }

    replaceTokens(file: string, replacements: Map<string, string>) {
        console.log(`replace tokens in ${file}`);
        let content = readFileSync(file, { encoding: "utf8" });
        replacements.forEach((value, key) => {
            console.log(`replace "##${key}##" with "${value}"`);
            var expr = new RegExp(`##${key}##`, "g");
            content = content.replace(expr, value);
        })
        writeFileSync(file, content);
    }

    createArchive(sourcePath: string, targetFile: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let cwd = process.cwd();
            let absPath = `${cwd}${sep}${sourcePath}`;
            var absTargetFile = `${cwd}${sep}${targetFile}`;
            console.log("archive", absPath, "to", absTargetFile);

            let output = createWriteStream(absTargetFile);
            let archive = archiver("zip");
            output.on('close', function () {
                console.log('compressed ' + archive.pointer() + ' total bytes');
                resolve();
            });

            archive.on('warning', function (err) {
                if (err.code === 'ENOENT') {
                    console.warn(err);
                } else {
                    reject(err);
                }
            });

            archive.on('error', function (err) {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(absPath, false);
            archive.finalize();
        });
    }

    generate(outputDir: string) {
        if (!this.tryCreatePath(TEMP_DIR)) {
            this.clearPath(TEMP_DIR);
        }
        this.copyAllFiles(TEMPLATE_DIR, TEMP_DIR);

        let apiDir = `${TEMP_DIR}${sep}api`;
        this.createWriter(`${apiDir}${sep}global.doclua`, "a");
        this.writeGameApi();
        this.writeEvents();
        this.finalizeWriter();

        this.createWriter(`${apiDir}${sep}globals.doclua`, "w+");
        this.writeGlobals();
        this.finalizeWriter();

        let objects = this.documentation.objects;
        objects.forEach(object => {
            this.createWriter(`${apiDir}${sep}${object.name}.doclua`, "w+");
            this.writeObject(object);
            this.finalizeWriter();
        });

        let version = this.documentation.apiVersion.toString();
        let replacements = new Map<string, string>();
        replacements.set("APIVERSION", version);
        this.replaceTokens(`${TEMP_DIR}${sep}esolua.rockspec`, replacements);

        this.createArchive(apiDir, `${TEMP_DIR}${sep}api.zip`).then(() => {
            this.clearPath(apiDir);
            rmdirSync(apiDir);
            return this.createArchive(TEMP_DIR, `${outputDir}${sep}esolua${version}.zip`);
        }).then(() => {
            this.clearPath(TEMP_DIR);
            rmdirSync(TEMP_DIR);
        });
    }
}