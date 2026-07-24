// shared/index.js -- public barrel for cross-cutting infrastructure.
export { deepFreeze } from './freezeDeep.js';
export { SEVERITY } from './severity.js';
export { createDependencyGraph } from './dependencyGraph.js';
export * from './errors/index.js';
export * from './logging/index.js';
export * from './version/index.js';
