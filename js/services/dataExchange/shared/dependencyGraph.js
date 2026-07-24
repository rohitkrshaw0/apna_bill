// shared/dependencyGraph.js
// Generic dependency-ordering utility -- no entity names are known here.
// A future importer registers whatever nodes/edges its own entities need,
// e.g. (illustrative only, not implemented below):
//   graph.addNode('company'); graph.addNode('item');
//   graph.addEdge('company', 'item'); // item depends on company
//   graph.topologicalOrder(); // ['company', 'item']

import { createDataExchangeError } from './errors/dataExchangeError.js';
import { ERROR_CATEGORY, ERROR_CODES } from './errors/index.js';
import { SEVERITY } from './severity.js';

export function createDependencyGraph () {
  const nodes = new Set();
  const edges = new Map(); // node -> Set of nodes it depends on

  function addNode (node) { nodes.add(node); if (!edges.has(node)) edges.set(node, new Set()); }
  function addEdge (node, dependsOn) {
    addNode(node); addNode(dependsOn);
    edges.get(node).add(dependsOn);
  }
  function getDependents (node) {
    return Array.from(nodes).filter(n => edges.get(n).has(node));
  }

  function topologicalOrder () {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    function visit (node, path) {
      if (visited.has(node)) return;
      if (visiting.has(node)) {
        throw createDataExchangeError({
          message: `Dependency cycle detected: ${path.concat(node).join(' -> ')}`,
          code: ERROR_CODES.CYCLE_DETECTED,
          severity: SEVERITY.CRITICAL,
          category: ERROR_CATEGORY.SYSTEM,
          source: 'dependencyGraph'
        });
      }
      visiting.add(node);
      for (const dep of edges.get(node)) visit(dep, path.concat(node));
      visiting.delete(node);
      visited.add(node);
      order.push(node);
    }

    for (const node of nodes) visit(node, []);
    return order;
  }

  return { addNode, addEdge, getDependents, topologicalOrder };
}
