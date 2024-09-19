function arrayify(xs) {
  return Array.isArray(xs) ? xs : [xs];
}

function checkString(item) {
  if (typeof item !== "string" || !item) {
    throw new TypeError("item must be a non-empty string");
  }
  return item;
}

function checkForCycle(node, predecessors) {
  if (predecessors.length !== 0 && predecessors.indexOf(node) !== -1) {
    throw new Error(`Cyclic dependency found. ${node} is dependent of itself.\nDependency chain: ${predecessors.join(" -> ")} => ${node}`);
  }
}

module.exports = function sort(obj, valueMapper) {
  if (Array.isArray(obj)) { return _sort(obj); }
  const items = Object.entries(obj).map(([k, v]) => [k, valueMapper(v)]);
  return _sort(items);
}

function _sort(items) {
  const edges = [];

  for (let [item, dependencies] of items) {
    checkString(item);
    const deps = arrayify(dependencies);
    if (deps.length > 0) {
      for (let dep of deps) {
        edges.push([item, checkString(dep)]);
      }
    } else {
      edges.push([item]);
    }
  }

  const nodes = [];
  for (let edge of edges) {
    for (let node of edge) { if (nodes.indexOf(node) === -1) { nodes.push(node); } }
  }

  const sorted = new Array(nodes.length);
  let place = nodes.length;

  const visit = (node, predecessors) => {
    checkForCycle(node, predecessors);
    let index = nodes.indexOf(node);
    if (index !== -1) {
      let copy = false;
      nodes[index] = false;
      for (let edge of edges) {
        if (edge[0] === node) {
          copy = copy || predecessors.concat([node]);
          visit(edge[1], copy);
        }
      }
      sorted[--place] = node;
    }
  };

  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];
    if (node !== false) {
      nodes[i] = false;
      for (let edge of edges) {
        if (edge[0] === node) {
          visit(edge[1], [node]);
        }
      }
      sorted[--place] = node;
    }
  }

  return sorted;
}
