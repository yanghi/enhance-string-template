import parse, { compile, createEnhanceCompiler, Plugin, PipePlugin, SlicePlugin, GlobalPlugins, defaultOptions, VariableProviderPlugin } from '../index'

describe('template', () => {
    it('defaultOptions', () => {
        let defaultCompieOpts = { ...defaultOptions.compile }
        defaultOptions.compile.pairs = {
            start: '{{',
            end: '}}',
        }
        defaultOptions.compile.transformBlock = (b) => {
            b.myName = b.name.toUpperCase()
        }

        let r_1 = compile('{{foo}}', {}, false)

        expect(r_1.blocks.length).toBe(1)
        expect(r_1.blocks[0].myName).toBe('FOO')

        // resume
        defaultOptions.compile = defaultCompieOpts

        expect(compile('{{foo}}', {}, false).blocks.length).toBe(0)

    })
    it('compile/original', () => {
        let r_1 = compile('<foo><bar>', {}, false)
        expect(r_1.blocks.length).toBe(2)

        let var_1 = r_1.blocks[0]

        expect(var_1.name).toBe('foo')
        expect(var_1.loc.s).toBe(0)
        expect(var_1.loc.vs).toBe(1)
        expect(var_1.loc.e).toBe(4)
        expect(var_1.loc.ve).toBe(3)

        expect(var_1.raw).toBe('foo')

        let var_2 = r_1.blocks[1]

        expect(var_2.name).toBe('bar')
        expect(var_2.loc.s).toBe(5)
        expect(var_2.loc.vs).toBe(6)
        expect(var_2.loc.e).toBe(9)
        expect(var_2.loc.ve).toBe(8)

        let r_2 = compile('.{{ foo }}.', { pairs: { start: '{{', end: '}}' } }, false)
        expect(r_2.blocks.length).toBe(1)

        let var_3 = r_2.blocks[0]

        // will be trimed
        expect(var_3.name).toBe('foo')
        expect(r_2.template.slice(var_3.loc.vs, var_3.loc.ve + 1)).toBe(' foo ')
        expect(var_3.loc.s).toBe(1)
        expect(var_3.loc.vs).toBe(3)
        expect(var_3.loc.e).toBe(9)
        expect(var_3.loc.ve).toBe(7)

        // empty variable
        expect(compile('hi<>', {}, false).blocks.length).toBe(0)
        expect(compile('hi<  >', {}, false).blocks.length).toBe(0)

    })
    it('compile/parser', () => {
        let spy_1 = jest.fn((res) => {
            return res.blocks.map(b => b.name).join(',')
        })

        let r_1 = compile('<foo><bar>', {}, spy_1)

        expect(r_1).toBe('foo,bar')
        expect(spy_1).toBeCalledWith(compile('<foo><bar>', {}, false))
        expect(spy_1).toReturnWith(r_1)

        // default
        let parser = compile('hello {{name}}', {
            pairs: {
                start: '{{',
                end: '}}'
            }
        })
        // 'hello world'
        parser({ name: 'world' })
    })
    it('parse', () => {
        expect(parse('hi <0>', ['jim'])).toBe('hi jim')
        expect(parse('<foo><bar>', { foo: 'FOO', bar: 'BAR' })).toBe('FOOBAR')
        expect(parse('<rootDir>/path/to', { rootDir: '/foo' })).toBe('/foo/path/to')
        expect(parse('..<foo>..<bar>..', { foo: 'FOO', bar: 'BAR' })).toBe('..FOO..BAR..')
        expect(parse('hi, <name>.', { name: 'jim' })).toBe('hi, jim.')
    })
    it('createEnhanceCompiler', () => {
        GlobalPlugins.add([PipePlugin])

        let enhanceCompiler = createEnhanceCompiler(['pipe', SlicePlugin], {
            pairs: {
                start: '{',
                end: '}'
            }
        })
        let template = enhanceCompiler('{key|upper}:{hash:3}')

        let values = {
            key: 'hash',
            upper(s: string) {
                return s.toUpperCase()
            },
            hash: '1234567'
        }
        // 'HASH:123'
        expect(template(values)).toBe('HASH:123')

        expect(enhanceCompiler('..{key|upper}:{hash:3}..')(values)).toBe('..HASH:123..')

        enhanceCompiler.remove('pipe')

        expect(enhanceCompiler('..{key|upper}:{hash:3}..')({
            key: 'hash',
            upper(s: string) {
                return s.toUpperCase()
            },
            hash: '1234567'
        })).toBe('..undefined:123..')

        enhanceCompiler.remove(SlicePlugin)

        expect(enhanceCompiler('..{key|upper}:{hash:3}..')({
            key: 'hash',
            upper(s: string) {
                return s.toUpperCase()
            },
            hash: '1234567'
        })).toBe('..undefined:undefined..')

        let c2 = createEnhanceCompiler([], {
            pairs: {
                start: '{',
                end: '}'
            }
        })

        expect(c2('..{key|upper}:{hash:3}..')(values)).not.toBe('..HASH:123..')
        c2.add([SlicePlugin, 'pipe'])
        expect(c2('..{key|upper}:{hash:3}..')(values)).toBe('..HASH:123..')

    })
    it('customize plugin', () => {
        let MyPlugin: Plugin = {
            name: 'my-plugin',
            transformBlock(block) {
                let nums = block.raw.split('+')

                if (nums.length > 1) {
                    // Tell the compiler to use 'my-plugin' when parse the result
                    block.hits.push('my-plugin')
                    block.nums = nums.map(n => n.trim())
                }
            },
            value(values, block) {
                let numVars = block.nums.map((_, i) => 'num_' + i)
                let ret = 'return ' + (numVars.join('+'))
                let fn = new Function(...numVars.concat(ret))

                return fn.apply(null, block.nums.map(n => values[n]))
            }
        }
        let myCompiler = createEnhanceCompiler([MyPlugin])

        let template = myCompiler('result: <a+b+c>')

        expect(template({ a: 1, b: 2, c: 3 })).toBe('result: 6')
    })
})

describe('built-in plugins', () => {
    it('VariableProviderPlugin', () => {
        var providerPlugin = new VariableProviderPlugin({
            name: 'rootVariableProvider',
            provide: { root: '/root' },
            prefix: '$'
        })
        expect(providerPlugin.name).toBe('rootVariableProvider')
        let enhanceComplier = createEnhanceCompiler([providerPlugin])
        providerPlugin.provide({ userDir: '/usr' })

        expect(enhanceComplier('<$root><$userDir>')({ $root: '/custom' })).toBe('/custom/usr')
        expect(enhanceComplier('<$root><$userDir><other>')({ other: '/something' })).toBe('/root/usr/something')

        let p_2 = new VariableProviderPlugin()

        expect(p_2.name).toBe('var-provider-1')

        // should work well
        p_2.provide({ a: 1 })
        expect(p_2.valueProvides['a']).toBe(1)
        p_2.provide({ b: 2 })
        expect(p_2.valueProvides['a']).toBe(1)
        expect(p_2.valueProvides['b']).toBe(2)

        p_2.provide([0])
        expect(p_2.valueProvides[0]).toBe(0)
        expect(p_2.valueProvides.length).toBe(1)

        p_2.provide([1])
        expect(p_2.valueProvides[0]).toBe(0)
        expect(p_2.valueProvides[1]).toBe(1)
        expect(p_2.valueProvides.length).toBe(2)

        p_2.provide([2], false)
        expect(p_2.valueProvides[0]).toBe(2)
        expect(p_2.valueProvides.length).toBe(1)

        let p_3 = new VariableProviderPlugin()
        expect(p_3.name).toBe('var-provider-2')
        expect(createEnhanceCompiler([p_3])('<name>')({ name: 'hi' })).toBe('hi')
    })
})