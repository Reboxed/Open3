// rehype-class-all.js

import { visit } from 'unist-util-visit';

function rehypeClassAll(options: { className?: string } = {}) {
  const className = options.className || 'md'; // Default class name

  return (tree: any) => {
    visit(tree, (node) => {
      if (node.type === 'element') {
        if (node.properties) {
          if (node.properties.className) {
            if (Array.isArray(node.properties.className)) {
              if (!node.properties.className.includes(className)) {
                node.properties.className.push(className);
              }
            } else if (typeof node.properties.className === 'string') {
              if (!node.properties.className.split(' ').includes(className)) {
                node.properties.className += ' ' + className;
              }
            }
          } else {
            node.properties.className = [className];
          }
        } else {
          node.properties = { className: [className] };
        }
      }
    });
  };
}

export default rehypeClassAll;
