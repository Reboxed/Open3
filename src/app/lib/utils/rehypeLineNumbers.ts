// rehypeLineNumbers.ts
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Element } from 'hast';

const rehypeLineNumbers: Plugin = () => {
//     return (tree) => {
//         visit(tree, 'element', (node: Element, index, parent) => {
//             if (
//                 node.tagName === 'code' &&
//                 parent?.type === 'element' &&
//                 parent.tagName === 'pre' &&
//                 node.children.length === 1 &&
//                 node.children[0].type === 'text'
//             ) {
//                 const lines = node.children[0].value.split('\n');
// 
//                 node.children = lines.map((line, i) => ({
//                     type: 'element',
//                     tagName: 'span',
//                     properties: { className: ['code-line'] },
//                     children: [
//                         {
//                             type: 'element',
//                             tagName: 'span',
//                             properties: { className: ['line-number'] },
//                             children: [{ type: 'text', value: String(i + 1) }],
//                         },
//                         {
//                             type: 'text',
//                             value: ' ' + line,
//                         },
//                     ],
//                 }));
//             }
//         });
//     };
};

export default rehypeLineNumbers;

