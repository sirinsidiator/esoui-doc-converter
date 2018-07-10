# esoui-doc-converter
This tool generates an Execution Environment used by Eclipse LDT and a XML Schema out of the ESOUIDocumentation.txt.

## Prerequisites
You need node.js (tested with v10.1.0) and the typescript compiler in order to run this tool. After installing node.js you can run the following commands in order to set everything up.

```
npm install -g typescript
npm install
tsc
```

## Usage
Just run `node bin/main.js <path/to/ESOUIDocumentation.txt>` and it should create a zip and xsd file in the `target/` folder.

## Execution Environment
The template is based on the Lua5.1 Execution Environment. The Elder Scrolls Online uses a variation of Havoc Script based on Lua 5.1, so this is a good starting point. A few modules and functions are not available in-game so they have been removed.

Original EE files copied from:
* http://git.eclipse.org/c/ldt/org.eclipse.ldt.git/tree/plugins/org.eclipse.ldt.support.lua51/src-ee/lua-5.1

More information about the structure:
* https://wiki.eclipse.org/LDT/User_Area/Tutorial/Create_a_simple_Execution_Environment
* https://wiki.eclipse.org/LDT/User_Area/Execution_Environment_file_format
* https://wiki.eclipse.org/LDT/User_Area/Documentation_Language

## XML Schema
This file can be used by any IDE that supports xsd files to validate and autocomplete the XML used by ESO. You can find more information at https://sir.insidi.at/or/2018/07/10/schema-definition-for-esoui-xml/‎
