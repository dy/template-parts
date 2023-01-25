# template-parts [![test](https://github.com/spectjs/template-parts/actions/workflows/test.yml/badge.svg)](https://github.com/spectjs/template-parts/actions/workflows/test.yml) [![npm version](https://img.shields.io/npm/v/template-parts)](http://npmjs.org/template-parts)

> Compact [template parts](https://github.com/WICG/webcomponents/blob/gh-pages/proposals/Template-Instantiation.md#32-template-parts-and-custom-template-process-callback) ponyfill.

Difference from [@github/template-parts](https://github.com/github/template-parts):

- _InnerTemplatePart_ support.
- More complete spec [API surface](#spec-surface).
- `<table><!--{{ data }}--></table>` support<sup><a href="#tables">*</a></sup> ([#24](https://github.com/domenic/template-parts/issues/2)).
- Single vanilla ESM, no tooling.
<!-- - [`<svg width={{ width }}>`](https://github.com/github/template-parts/issues/26) and other cases fixed. -->

## Usage

```js
import { TemplateInstance } from 'template-parts'

let tpl = new TemplateInstance(templateElement, initParams, processor)
tpl.update(newParams)

// eg. immediate singleton template:
// templateElement.replaceWith(tpl)
```

<details id="spec-surface">
  <summary>Spec surface</summary>

```js
interface TemplateInstance : DocumentFragment {
    void update(any state);
};

callback TemplateProcessCallback = void (TemplateInstance, sequence<TemplatePart>, any state);

dictionary TemplateProcessor {
    TemplateProcessCallback processCallback;
    TemplateProcessCallback? createCallback;
};

interface TemplatePart {
    readonly attribute DOMString expression;
    attribute DOMString? value;
};

interface AttributeTemplatePart : TemplatePart {
    readonly attribute Element element;
    readonly attribute DOMString attributeName;
    readonly attribute DOMString attributeNamespace;
    attribute boolean booleanValue;
};

interface NodeTemplatePart : TemplatePart {
    readonly attribute ContainerNode parentNode;
    readonly attribute Node? previousSibling;
    readonly attribute Node? nextSibling;
    [NewObject] readonly NodeList replacementNodes;
    void replace((Node or DOMString)... nodes);
    void replaceHTML(DOMString html);
};

interface InnerTemplatePart : NodeTemplatePart {
    HTMLTemplateElement template;
    attribute DOMString directive;
};
```
</details>


### Tables

Due to HTML quirk in table parsing, table fields should be wrapped into comment:

```html
<table>
  <!--{{ thead }}-->
  <tbody>
    <!--{{ rows }}-->
  </tbody>
</table>
```

## InnerTemplatePart

_Template parts_ recognize inner templates as [_InnerTemplatePart_](https://github.com/WICG/webcomponents/blob/gh-pages/proposals/Template-Instantiation.md#33-conditionals-and-loops-using-nested-templates), expecting `directive` and `expression` attributes.

```html
<template>
  <div>
    <template directive="if" expression="isActive">{{x}}</template>
  </div>
</template>
```

## processor

Default processor is _property identity, boolean attribute or function_:

```js
const el = document.createElement('template')
el.innerHTML = `<div x={{x}} hidden={{hidden}} onclick={{onclick}}></div>`

const tpl = new TemplateInstance(el, { x: 'Hello', hidden: false, onclick: () => {} })
el.getAttribute('x') // 'Hello'
el.hasAttribute('hidden') // false
el.onclick // function
```

_Template Parts_ processor is interoperable with any standard processor, eg. [github/template-parts](https://github.com/github/template-parts).

## See also

* [templize](https://github.com/spectjs/templize) − elaborate expressions and reactive props processor for template-parts.

## Alternatives

* [@github/template-parts](https://github.com/github/template-parts) − viable Template Parts implementation, doesn't closely follow spec in secondary details, but provides reliable ground.
* [template-extensions](https://github.com/luwes/template-extensions) – user-fiendly adoption of template parts. 
* [template-instantiation-polyfill](https://github.com/bennypowers/template-instantiation-polyfill#readme) − closely follows the Template Instantiation spec algorithm, but [is not recommended](https://github.com/bennypowers/template-instantiation-polyfill/pull/2#issuecomment-1004110993) by author.
* [PolymerLabs/template-instantiation](https://github.com/PolymerLabs/template-instantiation) − implementation from Google with TemplateAssembly, TemplateRule and other extensions.
* [template-instance](https://github.com/ar2r13/TemplateInstance)
* [template-instantiation-prollyfill](https://www.npmjs.com/package/template-instantiation-prollyfill)

<p align="center"><a href="https://github.com/krsnzd/license">🕉</a><p>
