# enhance-string-template

enhanced string template parser

## Usage

**Basic**

```ts
import parse, { compile, defaultOptions } from "enhance-string-template";

// '/root/path/to'
parse("<rootDir>/path/to", { rootDir: "/root" });
// 'hi jim'
parse("hi <0>", ["jim"]);
// using the '\\' to escape
parse("\\<rootDir>/path/to", { rootDir: "/root" });
// use custom default options
defaultOptions.compile.pairs = {
  start: "{",
  end: "}",
};
parse("{rootDir}/path/to", { rootDir: "/root" });

// compile
let tempate = compile("hello {{name}}", {
  pairs: {
    start: "{{",
    end: "}}",
  },
});
// 'hello world'
tempate({ name: "world" });
```

**Enhanced compiler**

```ts
import {
  createEnhanceCompiler,
  PipePlugin,
  SlicePlugin,
  GlobalPlugins,
} from "enhance-string-template";

GlobalPlugins.add(PipePlugin);
// use the plugin's name 'pipe' to resigter the PipePlugin when you add to GlobalPlugins
var enhanceCompiler = createEnhanceCompiler(
  ["pipe" /* same as PipePlugin.name */, SlicePlugin],
  {
    pairs: {
      start: "{",
      end: "}",
    },
  }
);
// Now, you can use the functionality of the plugins
let template = enhanceCompiler("{key|upper}:{hash:3}");

// 'HASH:123'
template({
  key: "hash",
  upper(s: string) {
    return s.toUpperCase();
  },
  hash: "1234567",
});

// you can remove the regsitered plugin by remove function
enhanceCompiler.remove(["pipe", "slice"]);
```

**Built-in plugins**

List of plain object plugins

- SlicePlugin
- PipePlugin

List of class plugins

- VariableProviderPlugin

**Customize Plugin**

```ts
import { Plugin, createEnhanceCompiler } from "enhance-string-template";

let MyPlugin: Plugin = {
  name: "my-plugin",
  transformBlock(block) {
    let nums = block.raw.split("+");

    if (nums.length > 1) {
      // Tell the compiler to use 'my-plugin' when parse the result
      block.hits.push("my-plugin");
      block.nums = nums.map((n) => n.trim());
    }
  },
  value(values, block) {
    let numVars = block.nums.map((_, i) => "num_" + i);
    let ret = "return " + numVars.join("+");
    let fn = new Function(...numVars.concat(ret));

    return fn.apply(
      null,
      block.nums.map((n) => values[n])
    );
  },
};
let myCompiler = createEnhanceCompiler([MyPlugin]);

let template = myCompiler("result: <a+b+c>");
// 'result: 6'
template({ a: 1, b: 2, c: 3 });
```

