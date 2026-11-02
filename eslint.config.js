/**
 * ESLint Flat Config (v9+)
 * Yozi AI 项目代码规范
 *
 * 从 .eslintrc.js 迁移到 eslint.config.js (flat config)
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 */
import pluginVue from 'eslint-plugin-vue';

export default [
  // ==================== Vue 推荐规则 ====================
  ...pluginVue.configs['flat/recommended'],

  // ==================== 全局忽略 ====================
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'uni_modules/**',
      '.hbuilderx/**',
      'laf-backend/node_modules/**',
      'logs/**',
      'deploy/**',
      'vps-optimizer/**',
      'unpackage/**',
      'public/**',
      '*.min.js'
    ]
  },

  // ==================== 主配置 ====================
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.vue'],

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        __YOZI_TOKENS__: 'readonly',
        __YOZI_PREVIEW__: 'readonly',
        __wxConfig: 'readonly',
        plus: 'readonly',
        Component: 'readonly',
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        localStorage: 'readonly',
        location: 'readonly',
        history: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        getComputedStyle: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        // 浏览器全局变量
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        ArrayBuffer: 'readonly',
        DataView: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Symbol: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
        Buffer: 'readonly',
        // Node.js 全局变量
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        // uni-app 全局变量
        uni: 'readonly',
        wx: 'readonly',
        qq: 'readonly',
        getCurrentPages: 'readonly',
        getApp: 'readonly',
        // Vue 3 编译器宏
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        withDefaults: 'readonly'
      }
    },

    rules: {
      // ==================== 代码风格 ====================

      // 使用单引号
      quotes: ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],

      // 语句末尾加分号
      semi: ['warn', 'always'],

      // 缩进交由 Prettier 统一控制
      indent: 'off',

      // 对象/数组最后一项不加逗号
      'comma-dangle': ['warn', 'never'],

      // 箭头函数参数始终使用括号
      'arrow-parens': ['warn', 'always'],

      // 对象花括号内部空格
      'object-curly-spacing': ['warn', 'always'],

      // 数组方括号内部无空格
      'array-bracket-spacing': ['warn', 'never'],

      // 关键字前后空格
      'keyword-spacing': ['warn', { before: true, after: true }],

      // 操作符周围空格
      'space-infix-ops': 'warn',

      // 逗号后面加空格
      'comma-spacing': ['warn', { before: false, after: true }],

      // 最大行长度
      'max-len': 'off',

      // ==================== 最佳实践 ====================

      // 使用 === 和 !==
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // 禁止使用 var
      'no-var': 'error',

      // 优先使用 const
      'prefer-const': ['error', { destructuring: 'all' }],

      // 禁止未使用的变量（错误级别，确保代码整洁）
      'no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      // 禁止 console（警告级别，允许 warn 和 error）
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // 禁止 debugger
      'no-debugger': 'error',

      // 禁止空函数
      'no-empty-function': 'warn',

      // 禁止不必要的分号
      'no-extra-semi': 'warn',

      // 禁止多余的空格
      'no-multi-spaces': 'warn',

      // 禁止多行空行
      'no-multiple-empty-lines': ['warn', { max: 2, maxEOF: 1 }],

      // 禁止行尾空格
      'no-trailing-spaces': 'warn',

      // ==================== Vue 规则 ====================

      // 组件名称使用 PascalCase
      'vue/component-name-in-template-casing': ['warn', 'PascalCase'],

      // 属性顺序
      'vue/attributes-order': [
        'warn',
        {
          order: [
            'DEFINITION',
            'LIST_RENDERING',
            'CONDITIONALS',
            'RENDER_MODIFIERS',
            'GLOBAL',
            'UNIQUE',
            'TWO_WAY_BINDING',
            'OTHER_DIRECTIVES',
            'OTHER_ATTR',
            'EVENTS',
            'CONTENT'
          ]
        }
      ],

      // 交由 Prettier 控制模板换行与属性排版，避免规则冲突
      'vue/max-attributes-per-line': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',

      // 自闭合标签
      'vue/html-self-closing': [
        'warn',
        {
          html: { void: 'always', normal: 'never', component: 'always' },
          svg: 'always',
          math: 'always'
        }
      ],

      // 禁止 v-html（安全考虑，降级为警告）
      'vue/no-v-html': 'warn',

      // 组件选项顺序
      'vue/order-in-components': [
        'warn',
        {
          order: [
            'el',
            'name',
            'key',
            'parent',
            'functional',
            ['delimiters', 'comments'],
            ['components', 'directives', 'filters'],
            'extends',
            'mixins',
            ['provide', 'inject'],
            'ROUTER_GUARDS',
            'layout',
            'middleware',
            'validate',
            'scrollToTop',
            'transition',
            'loading',
            'inheritAttrs',
            'model',
            ['props', 'propsData'],
            'emits',
            'setup',
            'asyncData',
            'data',
            'fetch',
            'head',
            'computed',
            'watch',
            'watchQuery',
            'LIFECYCLE_HOOKS',
            'methods',
            ['template', 'render'],
            'renderError'
          ]
        }
      ],

      // 多词组件名（关闭，因为 uni-app 页面通常是 index.vue）
      'vue/multi-word-component-names': 'off',

      // 关闭 require-default-prop（uni-app 组件经常不需要）
      'vue/require-default-prop': 'off',

      // 关闭 require-prop-types（允许简写）
      'vue/require-prop-types': 'off'
    }
  },

  {
    files: ['src/**/*.{js,vue}'],
    rules: { 'no-undef': 'error' }
  },

  // ==================== 测试文件特殊规则 ====================
  {
    files: ['**/*.spec.js', '**/*.test.js', 'tests/**/*'],
    rules: {
      'no-console': 'off',
      'no-empty-function': 'off'
    }
  },

  // ==================== 配置文件特殊规则 ====================
  {
    files: ['*.config.js', '*.config.ts', 'scripts/**/*.{js,mjs,cjs}', 'laf-backend/standalone/*.mjs'],
    languageOptions: { ecmaVersion: 'latest' },
    rules: {
      'no-console': 'off'
    }
  }
];
