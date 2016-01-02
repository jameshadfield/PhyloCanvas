function BranchRenderer(options) {
  if (!options || !options.draw) {
    throw new Error('`draw` function is required for branch renderers');
  }

  this.draw = options.draw;
  this.prepareChild = options.prepareChild;
}

BranchRenderer.prototype.render = function (tree, branch, collapse) {
  if (collapse || !branch) return;

  if (tree.presentFlags.selected) {
    const showSelected = branch.selected &&
      (branch.leaf || !branch.parent || branch.parent.selected);
    tree.canvas.globalAlpha = showSelected ? 1 : tree.selectedAlpha;
  }

  branch.canvas.strokeStyle = branch.getColour();

  this.draw(tree, branch);

  if (branch.pruned) {
    return;
  }

  branch.drawNode();

  for (let i = 0; i < branch.children.length; i++) {
    if (this.prepareChild) {
      this.prepareChild(branch, branch.children[i]);
    }
    this.render(tree, branch.children[i], branch.collapsed || collapse);
  }
};

module.exports = BranchRenderer;
