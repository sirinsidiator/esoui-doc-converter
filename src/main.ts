import { EsoUIDocumentationParser } from "./docParser";
import { EsoUIDocumentation } from "./types";
import { EsoUIXMLXsdGenerator } from "./xsdGenerator";
import { EsoUILuaEEGenerator } from "./eeGenerator";

const OUTPUT_FOLDER = "target";

let docFile = process.argv[2];
if (docFile) {
    console.log("parse", docFile);
    const parser = new EsoUIDocumentationParser();
    parser.parse(docFile).then(function (documentation: EsoUIDocumentation) {
        const eeGenerator = new EsoUILuaEEGenerator(documentation);
        eeGenerator.tryCreatePath(OUTPUT_FOLDER);
        eeGenerator.generate(OUTPUT_FOLDER);

        const xsdGenerator = new EsoUIXMLXsdGenerator(documentation);
        xsdGenerator.generate(OUTPUT_FOLDER);
    });
} else {
    console.log("no file specified");
}