// inflate version of differ, ~260b
// + no sets / maps used
// + prepend/append/remove/clear short paths
// + a can be live childNodes/HTMLCollection

const swap = (parent, a, b, end = null) => {
  let i = 0, cur, next, bi, n = b.length, m = a.length, { remove, same, insert, replace } = swap;

  // skip head/tail
  while (i < n && i < m && same(a[i], b[i])) i++;
  while (i < n && i < m && same(b[n-1], a[m-1])) end = b[--m, --n];

  // append/prepend/trim shortcuts
  if (i == m) while (i < n) insert(end, b[i++], parent);
  // FIXME: can't use shortcut for childNodes as input
  // if (i == n) while (i < m) parent.removeChild(a[i++])

  else {
    cur = a[i];

    while (i < n) {
      bi = b[i++], next = cur ? cur.nextSibling : end;

      // skip
      if (same(cur, bi)) cur = next;

      // swap / replace
      else if (i < n && same(b[i], next)) (replace(cur, bi, parent), cur = next);

      // insert
      else insert(cur, bi, parent);
    }

    // remove tail
    while (!same(cur, end)) (next = cur.nextSibling, remove(cur, parent), cur = next);
  }

  return b
};

swap.same = (a,b) => a == b;
swap.replace = (a,b, parent) => parent.replaceChild(b, a);
swap.insert = (a,b, parent) => parent.insertBefore(b, a);
swap.remove = (a, parent) => parent.removeChild(a);

// minimal Template Instance API surface

const FRAGMENT = 11, ELEMENT = 1, STRING = 0, PART = 1;

const defaultProcessor = {
  processCallback(instance, parts, state) {
    if (!state) return
    for (const part of parts)
      if (part.expression in state) {
        const value = state[part.expression];

        // boolean attr
        if (
          typeof value === 'boolean' &&
          part instanceof AttributeTemplatePart &&
          typeof part.element[part.attributeName] === 'boolean'
        ) part.booleanValue = value;
        else part.value = value;
      }
  }
};

// API
class TemplateInstance extends DocumentFragment {
  #parts
  #processor
  constructor(template, state, processor=defaultProcessor) {
    super();
    this.appendChild(template.content.cloneNode(true));
    this.#parts = parse(this);
    this.#processor = processor;

    state ||= {};
    processor.createCallback?.(this, this.#parts, state);
    processor.processCallback(this, this.#parts, state);
  }
  update(state) { this.#processor.processCallback(this, this.#parts, state); }
}

class TemplatePart {
  constructor(setter, expr) { this.setter = setter, this.expression = expr; }
  toString() { return this.value; }
}

class AttributeTemplatePart extends TemplatePart {
  #value = '';
  get attributeName() { return this.setter.attr.name; }
  get attributeNamespace() { return this.setter.attr.namespaceURI; }
  get element() { return this.setter.element; }
  get value() { return this.#value; }
  set value(newValue) {
    if (this.#value === newValue) return // save unnecessary call
    this.#value = newValue;
    const { attr, element, parts } = this.setter;
    if (parts.length === 1) { // fully templatized
      if (newValue == null) element.removeAttributeNS(attr.namespaceURI, attr.name);
      else element.setAttributeNS(attr.namespaceURI, attr.name, newValue);
    } else element.setAttributeNS(attr.namespaceURI, attr.name, parts.join(''));
  }
  get booleanValue() {
    this.setter.element.hasAttribute(this.setter.attr.name);
  }
  set booleanValue(value) {
    if (this.setter.parts.length === 1) this.value = value ? '' : null;
    else throw new DOMException('Value is not fully templatized');
  }
}

class NodeTemplatePart extends TemplatePart {
  #nodes = [new Text]
  get replacementNodes() { return this.#nodes }
  get parentNode() { return this.setter.parentNode; }
  get nextSibling() { return this.#nodes[this.#nodes.length-1].nextSibling; }
  get previousSibling() { return this.#nodes[0].previousSibling; }
  // FIXME: not sure why do we need string serialization here? Just because parent class has type DOMString?
  get value() { return this.#nodes.map(node=>node.textContent).join(''); }
  set value(newValue) { this.replace(newValue); }
  replace(...nodes) { // replace current nodes with new nodes.
    nodes = nodes
      .flat()
      .flatMap(node =>
        node==null ? [new Text] :
        node.forEach ? [...node] :
        node.nodeType === FRAGMENT ? [...node.childNodes] :
        node.nodeType ? [node] :
        [new Text(node)]
      );
    if (!nodes.length) nodes.push(new Text); // add placeholder if all nodes are removed
    // since template instance could've inserted, parent node refers to empty document fragment
    this.#nodes = swap(this.#nodes[0].parentNode, this.#nodes, nodes, this.nextSibling);
  }
  replaceHTML(html) {
    const fragment = this.parentNode.cloneNode();
    fragment.innerHTML = html;
    this.replace(fragment.childNodes);
  }
}

class InnerTemplatePart extends NodeTemplatePart {
  directive
  constructor(setter, template) {
    let directive = template.getAttribute('directive') || template.getAttribute('type'),
        expression = template.getAttribute('expression') || template.getAttribute(directive) || '';
    if (expression.startsWith('{{')) expression = expression.trim().slice(2,-2).trim();
    super(setter, expression);
    this.template = template;
    this.directive = directive;
  }
}

// collect element parts
const parse = (element, parts=[]) => {
  let attr, node, setter, type, value;

  for (attr of element.attributes || []) {
    if (attr.value.includes('{{')) {
      setter = { element, attr, parts: [] };
      for ([type, value] of tokenize(attr.value))
        if (!type) setter.parts.push(value);
        else value = new AttributeTemplatePart(setter, value), setter.parts.push(value), parts.push(value);
      attr.value = setter.parts.join('');
    }
  }

  for (node of element.childNodes) {
    if (node.nodeType === ELEMENT && !(node instanceof HTMLTemplateElement)) parse(node, parts);
    else {
      if (node.nodeType === ELEMENT || node.data.includes('{{')) {
        const setter = {parentNode: element, parts:[]};

        if (node.data) {
          for ([type, value] of tokenize(node.data))
            if (!type) setter.parts.push(new Text(value));
            else value = new NodeTemplatePart(setter, value), setter.parts.push(value), parts.push(value);
        }
        else {
          value = new InnerTemplatePart(setter, node);
          setter.parts.push(value), parts.push(value);
        }

        // AD-HOC: {{rows}}<table></table> → <table>{{ rows }}</table>
        // logic: for every empty node in a table there is meant to be part before the table.
        // NOTE: it doesn't cover all possible insertion cases, but the core ones.
        // TODO: it can be extended to detect on the moment of insertion, but it still won't be complete
        // removing for now
        // const tabular = ['caption','colgroup','thead','tbody','tfoot','tr'].map(e=>e+':empty')+''
        // if ((table = node.nextSibling)?.tagName === 'TABLE') {
        //   slots = table.matches(':empty') ? [table] : table.querySelectorAll(tabular)
        //   for (lastParts = []; lastParts.length < slots.length && setter.parts[setter.parts.length - 1] instanceof NodeTemplatePart;)
        //     lastParts.push(setter.parts.pop())

        //   for (slot of slots) {
        //     if (lastParts.length)
        //       parts.pop(), setter.parts.pop(),
        //       slot.appendChild(new Text(`{{ ${ lastParts.pop().expression } }}`)),
        //       setter.parts.push(new Text) // we have to stub removed field to keep children count
        //   }
        // }

        node.replaceWith(...setter.parts.flatMap(part => part.replacementNodes || [part]));
      }
    }
  }

  return parts
},

// parse string with template fields
tokenize = (text) => {
  let value = '', open = 0, tokens = mem[text], i = 0, c;

  if (tokens) return tokens; else tokens = [];

  for (; c=text[i]; i++) {
    if (c === '{' && text[i+1] === '{' && text[i-1] !== '\\' && text[i+2] && ++open==1) {
      if (value) tokens.push([STRING, value ]);
      value = '';
      i ++;
    }
    else if (c === '}' && text[i+1] === '}' && text[i-1] !== '\\' && !--open) {
      tokens.push([PART, value.trim() ]);
      value = '';
      i ++;
    }
    else value += text[i] || ''; // text[i] is undefined if i+=2 caught
  }
  if (value) tokens.push([STRING, value ]);

  return mem[text] = tokens
};
const mem = {};

export { AttributeTemplatePart, InnerTemplatePart, NodeTemplatePart, TemplateInstance, TemplatePart, defaultProcessor, parse, tokenize };
