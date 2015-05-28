// singleton object to reduce garbage
var bounds = {};

function resetBounds() {
  bounds.minx = 0;
  bounds.maxx = 0;
  bounds.miny = 0;
  bounds.maxy = 0;

  return bounds;
}

function setBounds(newBounds) {
  if (!newBounds) {
    return resetBounds();
  }
  bounds.minx = newBounds.minx;
  bounds.maxx = newBounds.maxx;
  bounds.miny = newBounds.miny;
  bounds.maxy = newBounds.maxy;
}

function expandBounds(x, y) {
  bounds.minx = Math.min(bounds.minx, x);
  bounds.maxx = Math.max(bounds.maxx, x);
  bounds.miny = Math.min(bounds.miny, y);
  bounds.maxy = Math.max(bounds.maxy, y);
}

function getBounds(leaves, tree) {
  var index;
  var leafx;
  var leafy;
  var theta;
  var padding;

  for (index = leaves.length; index--; ) {
    leafx = leaves[index].centerx;
    leafy = leaves[index].centery;
    theta = leaves[index].angle;
    padding = leaves[index].getNodeSize()
              + (tree.showLabels ? tree.maxLabelLength[tree.treeType] + leaves[index].getLabelSize() : 0)
              + (tree.showMetadata ? tree.getMetadataColumnHeadings().length * tree.metadataXStep : 0);

    leafx = leafx + (padding * Math.cos(theta));
    leafy = leafy + (padding * Math.sin(theta));

    expandBounds(leafx, leafy);
  }
  return bounds;
}

module.exports.resetBounds = resetBounds;
module.exports.setBounds = setBounds;
module.exports.getBounds = getBounds;
