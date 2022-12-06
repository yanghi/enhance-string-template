interface Block {
    loc: Readonly<{
        /**
         * block start position
         */
        s: number
        /**
         * block end position
         */
        e: number
        /**
         * block variable start position
         */
        vs: number
        /**
         * block variable end position
         */
        ve: number
    }>
    name: string
    readonly raw: string
    [x: string]: any
}

interface EnhanceBlock extends Block {
    /**
     * A list of plugin names used to convert block values
     */
    hits: string[]
}

type BlockTransform = (block: Block) => void
type EnhanceBlockTransform = (block: EnhanceBlock) => void

export interface CompileOptions {
    pairs?: {
        start: string,
        end: string
    }
    transformBlock?: BlockTransform | BlockTransform[]
    userOptions?: Record<any, any>
}

type BraketMatcher = (template: string, braket: string, loc: number) => ({
    next: number
    match: false
} | {
    next: number
    match: true
    loc: number
})
const braketMatcher: BraketMatcher = (template: string, braket: string, loc: number,) => {
    let len = braket.length

    if (template[loc] === braket[0] && template.slice(loc, loc + len) === braket) {
        return {
            match: true,
            next: loc + len,
            loc: loc
        }
    }

    return {
        match: false,
        next: ++loc
    }
}

function noop() { }
const isArray = Array.isArray

let _id = 0
function uid() {
    return ++_id
}
const isPlainObject = (arg: any): arg is object => {
    return arg && typeof arg === 'object' && !isArray(arg)
}


export interface OriginalCompileResult {
    template: string,
    blocks: Block[]
    options: CompileOptions
}

type Parser<R = any> = (result: OriginalCompileResult) => R

type ValueProvides = Record<any, any> | Array<any>

type Parse = (values: ValueProvides) => string

function parserResult(result: OriginalCompileResult, values: ValueProvides) {
    if (!result.blocks.length) return result.template

    let resultStr = ''
    let bi = 0

    for (let i = 0; i < result.blocks.length; i++) {
        const block = result.blocks[i];
        var value = values[block.name]

        resultStr += (result.template.slice(bi, block.loc.s) + value)
        bi = block.loc.e + 1
    }

    resultStr += result.template.slice(result.blocks[result.blocks.length - 1].loc.e + 1)

    return resultStr
}

export const defaultOptions: {
    compile: CompileOptions,
    parser: Parser
} = {
    compile: {
        pairs: {
            start: '<',
            end: '>'
        }
    },
    parser: function defaultParser(result) {
        return parserResult.bind(null, result)
    }
}

/**
 * @example
 * var templateParse = compile('hello, <name>')
 * templateParse({name: 'world'})
 */
export function compile(template: string, options?: CompileOptions): Parse
/**
 * return the original compile result
 */
export function compile(template: string, options: CompileOptions, parser: false): OriginalCompileResult
/**
 * customize compile parser, the parser will be called with original compile result paramter,and then, return the called result
 */
export function compile<R extends any>(template: string, options: CompileOptions, parser: Parser<R>): R
export function compile(template: string, options: CompileOptions = {}, parser: false | Parser = defaultOptions.parser): any {
    const { pairs = defaultOptions.compile.pairs,
        transformBlock = defaultOptions.compile.transformBlock || noop
    } = options

    const blocks: Block[] = [],
        startBraket = pairs.start!,
        endBraket = pairs.end!,
        transforms = Array.isArray(transformBlock) ? transformBlock : [transformBlock]

    let i = 0,
        len = template.length,
        escaped = false,
        open: {
            next: number;
            match: true;
            loc: number;
        } | null = null


    while (i < len) {
        if (escaped) {
            escaped = false
            i++
            continue
        }
        if (template[i] === '\\') {
            escaped = true
            i++
            continue
        }
        let match: ReturnType<BraketMatcher>
        if (open) {
            match = braketMatcher(template, pairs!.end, i)
            // closed
            if (match.match) {
                let rawValue = template.slice(open.next, match.loc).trim()

                if (rawValue) {
                    const block: Block = {
                        loc: {
                            s: open.loc,
                            e: match.loc + endBraket.length - 1,
                            vs: open.loc + startBraket.length,
                            ve: match.loc - 1
                        },
                        name: rawValue,
                        raw: rawValue
                    }

                    // transform(block)
                    transforms.forEach(transform => {
                        transform(block);
                    })

                    blocks.push(block)
                }
                open = null
            } else {
                match = braketMatcher(template, pairs!.start, i)
                match.match && (open = match)
            }
        } else {
            match = braketMatcher(template, pairs!.start, i)
            match.match && (open = match)
        }

        i = match.next
    }

    const result: OriginalCompileResult = {
        blocks,
        template,
        options
    }

    if (typeof parser !== 'function') {
        return result
    }

    return parser(result)
}

/**
 * @example
 * // '/foo/path/to'
 * parse('<rootDir>/path/to', {rootDir:'/foo'})
 * // "hi jim, i'm jack"
 * parse("hi <0>, i'm <1>", ['jim', 'jack'])
 */
export default function parse(template: string | OriginalCompileResult, values: ValueProvides) {
    if (typeof template === 'string') {
        return parserResult(compile(template, {}, false), values)
    }

    return parserResult(template, values)
}


export const GlobalPlugins = {
    plugins: {} as Plugins,
    add: function addGlobalPlugin(plugin: Plugin[] | Plugin) {
        const arr = Array.isArray(plugin) ? plugin : [plugin]

        arr.forEach(handler => {
            GlobalPlugins.plugins[handler.name] = handler
        })
    },
    remove: function removeGlobalPlugin(plugin: PluginArgument) {
        const arr = Array.isArray(plugin) ? plugin : [plugin]

        arr.forEach(handler => {
            delete GlobalPlugins.plugins[typeof handler == 'string' ? handler : handler.name]
        })
    }
}

function mergeArr<T>(target: T[], source: T | T[] | undefined) {
    if (source) {
        if (Array.isArray(source)) {
            target.push(...source)
        } else {
            target.push(source)
        }
    }
    return target
}

function parseResultWithPlugins(result: OriginalCompileResult, values: ValueProvides, plugins: Plugins) {
    if (!result.blocks.length) return result.template

    let resultStr = ''
    let bi = 0

    for (let i = 0; i < result.blocks.length; i++) {
        const block = result.blocks[i];
        var value

        if (block.hits.length) {
            for (let i = 0; i < block.hits.length; i++) {
                const hit = block.hits[i];
                let plugin: Plugin | undefined = plugins[hit]
                if (plugin && plugin.value) {
                    value = plugin.value(values, block as EnhanceBlock, value)
                }
            }
        } else {
            value = values[block.name]
        }

        resultStr += (result.template.slice(bi, block.loc.s) + value)
        bi = block.loc.e + 1
    }

    resultStr += result.template.slice(result.blocks[result.blocks.length - 1].loc.e + 1)

    return resultStr
}

function bindPluginContext<T extends Function | Function[]>(plugin: Plugin, fn: T) {
    if (typeof fn === 'function') {
        return fn.bind(plugin)
    }

    for (let i = 0; i < fn.length; i++) {
        fn[i] = fn[i].bind(plugin)
    }
    return fn
}

export function createEnhanceCompiler(plugins?: Array<Plugin | string>, options?: CompileOptions): EnhanceComplier {


    const mergedOptions = Object.assign({}, options)

    var transformBlock: BlockTransform[] = [function init(b) {
        b.hits = []
    }]

    const registerdPlugins: Plugins = {}

    if (!plugins) {
        Object.assign(registerdPlugins, GlobalPlugins.plugins)
    } else {
        plugins.forEach(pluginOrName => {
            let plugin = typeof pluginOrName === 'string' ? GlobalPlugins.plugins[pluginOrName] : pluginOrName
            if (plugin) {
                registerdPlugins[plugin.name] = plugin
            }
        })
    }
    mergedOptions.transformBlock = transformBlock
    mergeArr(transformBlock, mergedOptions.transformBlock)

        ; (Object.keys(registerdPlugins)).map(k => registerdPlugins[k]).forEach(plugin => {
            if (!plugin) return
            mergeArr(transformBlock, bindPluginContext(plugin, plugin.transformBlock))
        })

    function enhanceComplier(template: string) {
        let result = compile(template, mergedOptions, false)

        return function enhanceComplierParse(values: ValueProvides) {
            return parseResultWithPlugins(result, values, enhanceComplier.plugins)
        }
    }

    enhanceComplier.plugins = registerdPlugins

    enhanceComplier.add = function addPlugin(pluginOrName: Plugin | string) {
        let plugin = typeof pluginOrName === 'string' ? GlobalPlugins.plugins[pluginOrName] : pluginOrName
        if (plugin) {
            registerdPlugins[plugin.name] = plugin
        }
    }

    enhanceComplier.remove = function removePlugin(plugin: Plugin | string) {
        const arr = Array.isArray(plugin) ? plugin : [plugin]

        arr.forEach(handler => {
            delete enhanceComplier.plugins[typeof handler == 'string' ? handler : handler.name]
        })
    }

    return enhanceComplier as any
}

export interface Plugin<B extends Block = EnhanceBlock> {
    readonly name: string
    transformBlock?: EnhanceBlockTransform | EnhanceBlockTransform[]
    value?: (values: ValueProvides, block: B, prevValue: any) => any
}

type Plugins = Record<string, Plugin>
interface EnhanceComplier extends PluginManager {
    (template: string): Parse
}

type PluginArgument = string | Plugin | Array<string | Plugin>
interface PluginManager {
    plugins: Plugins
    /**
     * add plugin
     * @example
     * add('pipe')
     * add(myPlugin)
     * add([myPlugin, 'pipe'])
     */
    add(plugin: PluginArgument): void
    /**
     * remove plugin
     * @example
     * remove('pipe')
     * remove(myPlugin)
     * remove([myPlugin, 'pipe'])
     */
    remove(plugin: PluginArgument): void
}

export const PipePlugin: Plugin = {
    name: 'pipe',
    transformBlock: function pipeTransform(block) {
        var filters = block.raw.split('|')
        block.name = filters[0]
        filters.shift()

        if (filters.length) {
            block.filters = filters
            block.hits.push('pipe')
        }
    },
    value: function pipeValue(params, block, prevValue) {
        let value = prevValue || params[block.name]

        if (Array.isArray(block.filters)) {
            block.filters.forEach(filterKey => {
                let filterFn = params[filterKey.trim()]
                value = filterFn(value)
            })
        }

        return value
    }
}

/**
 * string slice plugin, teamplate like `"foo.<hash:3>.js"`
 */
export const SlicePlugin: Plugin = {
    name: 'slice',
    transformBlock: function sliceTransform(block) {
        var slices = block.raw.split(':', 2)

        if (slices[1]) {
            block.hits.push('slice')
            block.sliceName = slices[0].trim()
            block.slice = Number(slices[1])
        }
    },
    value: function sliceValue(values, block) {
        var value: string = values[block.sliceName] || ''
        return value.slice(0, block.slice)
    }
}

export interface VariableProviderPluginOptions {
    /**
     * plugin name
     */
    name?: string
    provide?: ValueProvides
    /**
     * If given, all template variable names need to be prefixed with prefix string to use the variable values provided by VariableProviderPlugin.
     * for example, prefix is '$', the template `<$myVaribale>`
     */
    prefix?: string
}

/**
 * @example
 * 
 * var providerPlugin = new VariableProviderPlugin({
 *  name: 'rootVariableProvider',
 *  provide: {root: '/root'},
 *  prefix: '$'
 * })
 * providerPlugin.provide({userDir: '/usr'})
 * let enhanceComplier = createEnhanceCompiler([providerPlugin])
 * // '/root/usr/something'
 * enhanceComplier('<$root><$userDir><other>')({other: '/something'})
 */
export class VariableProviderPlugin implements Plugin {
    name: string
    private _options: VariableProviderPluginOptions
    private _provides: ValueProvides
    constructor(options: VariableProviderPluginOptions = {}) {
        this.name = options.name || 'var-provider-' + uid()
        this._options = options
        this._provides = options.provide || {}
    }
    get valueProvides() {
        return this._provides
    }
    provide(values: ValueProvides, merge: boolean = true) {
        let before = this._provides
        if (merge) {
            // only merge the two object both same type
            if (this._provides == undefined || !((isArray(before) && isArray(values)) || (isPlainObject(before) && isPlainObject(values)))) {
                merge = false
            }
        }

        if (merge) {
            if (isArray(values)) {
                this._provides = this._provides.concat(values)
            } else {
                Object.assign(this._provides, values)
            }
        } else {
            this._provides = values
        }
    }
    transformBlock(block: EnhanceBlock) {
        let key = block.name
        if (this._options.prefix) {
            key = key.slice(this._options.prefix.length)
        }
        if (key in this._provides) {
            block.hits.push(this.name)
            block._vpKey = key
        }
    }
    value(vs: ValueProvides, block: EnhanceBlock) {
        if (block.name in vs) {
            return vs[block.name]
        }
        return this._provides[block._vpKey]
    }
}