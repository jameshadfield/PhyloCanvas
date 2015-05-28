var Branch = require('./Branch');
var ContextMenu = require('./ContextMenu');
var Tooltip = require('./Tooltip');
var Navigator = require('./Navigator');

var Angles = require('./utils/constants').Angles;
var Shapes = require('./utils/constants').Shapes;

var addClass = require('./utils/dom').addClass;
var getX = require('./utils/dom').getX;
var getY = require('./utils/dom').getY;

var fireEvent = require('./utils/events').fireEvent;
var addEvent = require('./utils/events').addEvent;

var getBackingStorePixelRatio =
  require('./utils/canvas').getBackingStorePixelRatio;

/**
 * The instance of a PhyloCanvas Widget
 *
 * @constructor
 * @memberof PhyloCanvas
 * @param div {string|HTMLDivElement} the div or id of a div that phylocanvas
 * will be drawn in
 *
 * {@link PhyoCanvas.Tree}
 *
 * @example
 *  new PhyloCanvas.Tree('div_id');
 *
 * @example
 *  new PhyloCanvas.Tree(div);
 */
function Tree(div, conf) {
  if (!conf) conf = {};
  // if the ID is provided get the element, if not assume div
  if (typeof div === 'string') div = document.getElementById(div);

  /**
   *
   * Dictionary of all branches indexed by Id
   */
  this.branches = {};
  /**
   *
   * List of leaves
   */
  this.leaves = [];
  /**
   * Loading dialog displayed while waiting for the tree
   */
  // this.loader = new Loader(div);
  /**
   * The root node of the tree
   * (not neccesarily a root in the Phylogenetic sense)
   */
  this.root = false;

  /**
   *
   * used for auto ids for internal nodes
   * @private
   */
  this.lastId = 0;

  /**
   * backColour colour the branches of the tree based on the colour of the
   * tips
   */
  this.backColour = false;

  this.origBL = {};
  this.origP = {};

  this.canvasEl = div;

  addClass(this.canvasEl, 'pc-container');

  // Set up the div and canvas element
  if (window.getComputedStyle(this.canvasEl).position === 'static') {
    this.canvasEl.style.position = 'relative';
  }
  this.canvasEl.style.boxSizing = 'border-box';
  var cl = document.createElement('canvas');
  cl.id = div.id + 'pCanvas';
  cl.className = 'phylocanvas';
  cl.style.position = 'relative';
  cl.style.backgroundColor = '#FFFFFF';
  cl.height = div.clientHeight || 400;
  cl.width = div.clientWidth || 400;
  cl.style.zIndex = '1';
  this.canvasEl.appendChild(cl);

  /***
   * Right click menu
   * Users could pass options while creating the Tree object
   */
  var menuOptions = [];
  if (conf.contextMenu !== undefined) {
    menuOptions = conf.contextMenu;
  }
  this.contextMenu = new ContextMenu(this, menuOptions);

  this.defaultCollapsedOptions = {};
  this.defaultCollapsed = false;
  if (conf.defaultCollapsed !== undefined) {
    if (conf.defaultCollapsed.min && conf.defaultCollapsed.max) {
      this.defaultCollapsedOptions = conf.defaultCollapsed;
      this.defaultCollapsed = true;
    }
  }

  this.tooltip = new Tooltip(this);

  this.drawn = false;

  this.zoom = 1;
  this.pickedup = false;
  this.dragging = false;
  this.startx = null; this.starty = null;
  this.pickedup = false;
  this.baseNodeSize = 1;
  this.curx = null;
  this.cury = null;
  this.origx = null;
  this.origy = null;

  this.canvas = cl.getContext('2d');

  this.canvas.canvas.onselectstart = function () { return false; };
  this.canvas.fillStyle = '#000000';
  this.canvas.strokeStyle = '#000000';
  this.canvas.save();

  this.offsetx = this.canvas.canvas.width / 2;
  this.offsety = this.canvas.canvas.height / 2;
  this.selectedColour = 'rgba(49,151,245,1)';
  this.highlightColour = 'rgba(49,151,245,1)';
  this.highlightWidth = 5.0;
  this.selectedNodeSizeIncrease = 0;
  this.branchColour = 'rgba(0,0,0,1)';
  this.branchScalar = 1.0;

  this.hoverLabel = false;

  this.internalNodesSelectable = true;

  this.showLabels = true;
  this.showBootstraps = false;

  this.treeType = 'radial';
  this.maxBranchLength = 0;
  this.lineWidth = 1.0;
  this.textSize = 7;
  this.font = 'sans-serif';

  this.unselectOnClickAway = true;
  this.rightClickZoom = true;

  if (this.useNavigator) {
    this.navigator = new Navigator(this);
  }

  this.adjustForPixelRatio();

  this.initialiseHistory(conf);

  this.addListener('contextmenu', this.clicked.bind(this));
  this.addListener('click', this.clicked.bind(this));

  this.addListener('mousedown', this.pickup.bind(this));
  this.addListener('mouseup', this.drop.bind(this));
  this.addListener('mouseout', this.drop.bind(this));

  addEvent(this.canvas.canvas, 'mousemove', this.drag.bind(this));
  addEvent(this.canvas.canvas, 'mousewheel', this.scroll.bind(this));
  addEvent(this.canvas.canvas, 'DOMMouseScroll', this.scroll.bind(this));
  addEvent(window, 'resize', function (evt) {
    this.resizeToContainer();
  }.bind(this));

  this.addListener('loaded', function (evt) {
    this.origBranches = this.branches;
    this.origLeaves = this.leaves;
    this.origRoot = this.root;
  }.bind(this));

  /**
   * Align nodes vertically
   */
  this.nodeAlign = false;
  /**
   * X and Y axes of the node that is farther from the root
   * Used to align node vertically
   */
  this.farthestNodeFromRootX = 0;
  this.farthestNodeFromRootY = 0;
  this.showMetadata = false;
  // Takes an array of metadata column headings to overlay on the tree
  this.selectedMetadataColumns = [];
  // Colour for 1 and 0s. Currently 0s are not drawn
  this.colour1 = 'rgba(206,16,16,1)';
  this.colour0 = '#ccc';
  /**
     Maximum length of label for each tree type.
     Because label length pixel differes for different tree types for some reason
   */
  this.maxLabelLength = {};
  // x step for metadata
  this.metadataXStep = 15;
  // Boolean to detect if metadata heading is drawn or not
  this.metadataHeadingDrawn = false;
}


Tree.prototype.AJAX = function (url, method, params, callback, callbackPars, scope, errorCallback) {
  var xmlhttp;
  if (window.XMLHttpRequest) {
    // code for IE7+, Firefox, Chrome, Opera, Safari
    xmlhttp = new XMLHttpRequest();
  } else {
    // code for IE6, IE5
    xmlhttp = new ActiveXObject('Microsoft.XMLHTTP');
  }

  xmlhttp.onreadystatechange = function () {
    if (xmlhttp.readyState === 4) {
      if (xmlhttp.status === 200) {
        callback(xmlhttp, callbackPars, scope);
      } else {
        if (errorCallback) errorCallback(xmlhttp, callbackPars, scope);
      }
    }
  };
  xmlhttp.open(method, url, true);
  if (method === 'GET') {
    xmlhttp.send();
  }
  else {
    xmlhttp.send(params);
  }
};

Tree.prototype.checkInitialTreeCollapseRange = function (node) {
  // Collapse nodes on default
  var childIds = node.getChildIds();
  if (childIds && childIds.length > this.defaultCollapsedOptions.min &&
      childIds.length < this.defaultCollapsedOptions.max) {
    node.collapsed = true;
  }
};

/**
 * A dictionary of functions. Each function draws a different tree structure
 */
Tree.prototype.branchRenderers = {
  rectangular: function (tree, node, collapse) {
    var  bl = node.branchLength * tree.branchScalar;
    node.angle = 0;
    if (node.parent) {
      node.centerx = node.startx + bl;
    }
    if (node.selected) {
      //this.parent && this.parent.selected ? this.tree.selectedColour : this.tree.branchColour;
      node.canvas.fillStyle = tree.selectedColour;
    } else {
      node.canvas.fillStyle = node.colour;
    }

    node.canvas.strokeStyle = node.getColour();
    node.canvas.beginPath();

    if (!collapse) {
      node.canvas.moveTo(node.startx, node.starty);
      node.canvas.lineTo(node.startx, node.centery);
      node.canvas.lineTo(node.centerx, node.centery);
      node.canvas.stroke();
      node.canvas.closePath();

      // Check initial tree collapse range
      if (tree.defaultCollapsed && tree.defaultCollapsedOptions) {
        tree.checkInitialTreeCollapseRange(node);
      }
      node.drawNode();
    }

    node.canvas.closePath();

    for (var i = 0; i < node.children.length && !collapse; i++) {
      node.children[i].startx = node.centerx;
      node.children[i].starty = node.centery;
      tree.branchRenderers.rectangular(tree, node.children[i], node.collapsed || collapse);
    }
  },
  circular: function (tree, node, collapse) {
    var bl = node.totalBranchLength * tree.branchScalar;
    node.canvas.strokeStyle = node.getColour();

    if (node.selected) {
      node.canvas.fillStyle = node.tree.selectedColour;
    } else {
      node.canvas.fillStyle = node.colour;
    }

    if (!collapse) {
      node.canvas.beginPath();
      node.canvas.moveTo(node.startx, node.starty);
      if (node.leaf) {
        node.canvas.lineTo(node.interx, node.intery);
        node.canvas.stroke();
        var ss = node.getColour();
        node.canvas.strokeStyle = node.selected ? node.tree.selectedColour :  'rgba(0,0,0,0.5)';
        node.canvas.lineTo(node.centerx, node.centery);
        node.canvas.stroke();
        node.canvas.strokeStyle = ss;
      } else {
        node.canvas.lineTo(node.centerx, node.centery);
        node.canvas.stroke();
      }

      node.canvas.strokeStyle = node.getColour();
      // Check initial tree collapse range
      if (tree.defaultCollapsed && tree.defaultCollapsedOptions) {
        tree.checkInitialTreeCollapseRange(node);
      }

      if (node.children.length > 1 && !node.collapsed) {
        node.canvas.beginPath();
        node.canvas.arc(0, 0, (bl), node.minChildAngle, node.maxChildAngle, node.maxChildAngle < node.minChildAngle);
        node.canvas.stroke();
        node.canvas.closePath();
      }
      node.drawNode();
    }

    for (var i = 0; i < node.children.length && !collapse; i++) {
      tree.branchRenderers.circular(tree, node.children[i], node.collapsed || collapse);
    }
  },
  radial: function (tree, node, collapse) {
    node.canvas.strokeStyle = node.getColour();

    if (node.selected) {
      node.canvas.fillStyle = node.tree.selectedColour;
    }
    else {
      node.canvas.fillStyle = node.colour;
    }

    if (node.parent && !collapse) {
      node.canvas.beginPath();
      node.canvas.moveTo(node.startx, node.starty);
      node.canvas.lineTo(node.centerx, node.centery);
      node.canvas.stroke();
      node.canvas.closePath();

      // Check initial tree collapse range
      if (tree.defaultCollapsed && tree.defaultCollapsedOptions) {
        tree.checkInitialTreeCollapseRange(node);
      }
      node.drawNode();
    }

    for (var i = 0; i < node.children.length && !collapse; i++) {
      tree.branchRenderers.radial(tree, node.children[i], node.collapsed || collapse);
    }
  },
  diagonal: function (tree, node, collapse) {
    node.angle = 0;
    node.canvas.strokeStyle = node.getColour();

    if (node.selected) {
      node.canvas.fillStyle = node.tree.selectedColour;
    } else {
      node.canvas.fillStyle = node.colour;
    }

    node.canvas.beginPath();
    // alert(node.starty);

    if (!collapse) {
      node.canvas.moveTo(node.startx, node.starty);
      node.canvas.lineTo(node.centerx, node.centery);
      node.canvas.stroke();
      node.canvas.closePath();

      // Check initial tree collapse range
      if (tree.defaultCollapsed && tree.defaultCollapsedOptions) {
        tree.checkInitialTreeCollapseRange(node);
      }
      node.drawNode();
    }

    node.canvas.closePath();

    for (var i = 0; i < node.children.length && !collapse; i++) {
      node.children[i].startx = node.centerx;
      node.children[i].starty = node.centery;
      tree.branchRenderers.diagonal(tree, node.children[i], node.collapsed || collapse);
    }
  },
  hierarchy: function (tree, node, collapse) {
    node.canvas.strokeStyle = node.getColour();

    if (node.selected) {
      node.canvas.fillStyle = node.tree.selectedColour;
    } else {
      node.canvas.fillStyle = node.colour;
    }

    if (!collapse) {
      node.canvas.beginPath();
      if (node !== node.tree.root) {
        node.canvas.moveTo(node.startx, node.starty);
        node.canvas.lineTo(node.centerx, node.starty);
      }

      node.canvas.lineTo(node.centerx, node.centery);
      node.canvas.stroke();

      // Check initial tree collapse range
      if (tree.defaultCollapsed && tree.defaultCollapsedOptions) {
        tree.checkInitialTreeCollapseRange(node);
      }
      node.drawNode();
    }
    node.canvas.closePath();

    for (var i = 0; i < node.children.length && !collapse; i++) {
      tree.branchRenderers.hierarchy(tree, node.children[i], node.collapsed || collapse);
    }
  }
};

Tree.prototype.clicked = function (e) {
  var node;
  var nids;
  if (e.button === 0) {
    nids = [];
    // if this is triggered by the release after a drag then the click
    // shouldn't be triggered.
    if (this.dragging) {
      this.dragging = false;
      return;
    }

    if (!this.root) return false;
    node = this.root.clicked(this.translateClickX(e.clientX), this.translateClickY(e.clientY));

    if (node) {
      this.root.setSelected(false, true);
      if (this.internalNodesSelectable || node.leaf) {
        node.setSelected(true, true);
        nids = node.getChildIds();
      }
      this.draw();
    } else if (this.unselectOnClickAway && this.contextMenu.closed && !this.dragging) {
      this.root.setSelected(false, true);
      this.draw();
    }

    if (!this.pickedup) {
      this.dragging = false;
    }

    this.nodesSelected(nids);
  } else if (e.button === 2) {
    e.preventDefault();
    node = this.root.clicked(
      this.translateClickX(e.clientX), this.translateClickY(e.clientY)
    );
    this.contextMenu.open(e.clientX, e.clientY, node);
    this.contextMenu.closed = false;
    this.tooltip.close();
  }
};

Tree.prototype.dblclicked = function (e) {
  if (!this.root) return false;
  var nd = this.root.clicked(this.translateClickX(e.clientX * 1.0), this.translateClickY(e.clientY * 1.0));
  if (nd) {
    nd.setSelected(false, true);
    nd.toggleCollapsed();
  }

  if (!this.pickedup) {
    this.dragging = false;
  }
  this.draw();
};

Tree.prototype.displayLabels = function () {
  this.showLabels = true;
  this.draw();
};

Tree.prototype.drag = function (event) {
  // get window ratio
  var ratio = (window.devicePixelRatio || 1) / getBackingStorePixelRatio(this.canvas);

  if (!this.drawn) return false;

  if (this.pickedup) {
    var xmove = (event.clientX - this.startx) * ratio;
    var ymove = (event.clientY - this.starty) * ratio;
    if (Math.abs(xmove) + Math.abs(ymove) > 5) {
      this.dragging = true;
      this.offsetx = this.origx + xmove;
      this.offsety = this.origy + ymove;
      this.draw();
    }
  } else if (this.zoomPickedUp) {
    // right click and drag
    this.d = ((this.starty - event.clientY) / 100);
    this.setZoom(this.origZoom + this.d);
    this.draw();
  } else {
    // hover
    var e = event;
    var nd = this.root.clicked(this.translateClickX(e.clientX * 1.0), this.translateClickY(e.clientY * 1.0));

    if (nd && (this.internalNodesSelectable || nd.leaf)) {
      this.root.setHighlighted(false);
      nd.setHighlighted(true);
      // For mouseover tooltip to show no. of children on the internal nodes
      if (!nd.leaf && this.contextMenu.closed) {
        this.tooltip.open(e.clientX, e.clientY, nd);
      }
    } else {
      this.tooltip.close();
      this.contextMenu.close();
      this.root.setHighlighted(false);
    }
    this.draw();
  }
};

/**
 * Draw the frame
 */
Tree.prototype.draw = function (forceRedraw) {
  if (this.maxBranchLength === 0) {
    this.loadError('All branches in the tree are identical.');
    return;
  }

  this.canvas.restore();

  this.canvas.clearRect(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
  this.canvas.lineCap = 'round';
  this.canvas.lineJoin = 'round';

  this.canvas.strokeStyle = this.branchColour;
  this.canvas.save();

  this.canvas.translate((this.canvas.canvas.width / 2) / getBackingStorePixelRatio(this.canvas),
    (this.canvas.canvas.height / 2) / getBackingStorePixelRatio(this.canvas));

  if (!this.drawn || forceRedraw) {
    this.prerenderers[this.treeType](this);
    if (!forceRedraw) { this.fitInPanel(); }
  }

  this.canvas.lineWidth = this.lineWidth / this.zoom;
  this.canvas.translate(this.offsetx, this.offsety);
  this.canvas.scale(this.zoom, this.zoom);

  this.branchRenderers[this.treeType](this, this.root);
  // Making default collapsed false so that it will collapse on initial load only
  this.defaultCollapsed = false;
  this.metadataHeadingDrawn = false;
  this.drawn = true;
};

Tree.prototype.drop = function () {
  if (!this.drawn) return false;
  this.pickedup = false;
  this.zoomPickedUp = false;
};

Tree.prototype.findBranch = function (patt) {
  this.root.setSelected(false, true);
  for (var i = 0; i < this.leaves.length; i++) {
    if (this.leaves[i].id.match(new RegExp(patt, 'i'))) {
      this.leaves[i].setSelected(true, true);
    }
  }
  this.draw();
};

Tree.prototype.clearSelect = function () {
  this.root.setSelected(false, true);
  this.draw();
};

Tree.prototype.genId = function () {
  return 'pcn' + this.lastId++;
};

Tree.prototype.getPngUrl = function () {
  return this.canvas.canvas.toDataURL();
};

Tree.prototype.hideLabels = function () {
  this.showLabels = false;
  this.draw();
};

Tree.prototype.dangerouslySetData = function (treeData) {
  this.parseNwk(treeData, null);
  this.draw();
  this.loadCompleted();
};

Tree.prototype.load = function (tree, name, format) {
  if (format) {
    if (format.match(/nexus/i)) {
      if (tree.match(/\.\w+$/)) {
        this.AJAX(tree, 'GET', '', this.loadFileCallback, { format: 'nexus', name: name }, this);
      } else {
        this.parseNexus(tree, name);
      }
    } else if (format.match(/newick/i)) {
      if (tree.match(/\.\w+$/)) {
        this.AJAX(tree, 'GET', '', this.loadFileCallback, { format: 'newick' }, this);
      } else {
        this.parseNwk(tree, name);
      }
    }
  } else {
    if (tree.match(/\.n(ex|xs)$/)) {
      this.AJAX(tree, 'GET', '', this.loadFileCallback, { format: 'nexus', name: name }, this);
    } else if (tree.match(/\.nwk$/)) {
      this.AJAX(tree, 'GET', '', this.loadFileCallback, { format: 'newick' }, this);
    } else if (tree.match(/^#NEXUS[\s\n;\w\.\*\:(\),-=\[\]\/&]+$/i)) {
      this.parseNexus(tree, name);
      this.draw();
      this.loadCompleted();
    } else if (tree.match(/^[\w\.\*\:(\),-\/]+;\s?$/gi)) {
      this.parseNwk(tree, name);
      this.draw();
      this.loadCompleted();
    } else {
      this.loadError('PhyloCanvas did not recognise the string as a file or a newick or Nexus format string');
    }
  }
};

Tree.prototype.loadFileCallback = function (response, opts, scope) {
  if (opts.format.match(/nexus/i)) {
    scope.parseNexus(response.responseText, opts.name);
  } else if (opts.format.match(/newick/i)) {
    scope.parseNwk(response.responseText);
  } else {
    throw new Error('file type not recognised by PhyloCanvas');
  }
  scope.draw();
  scope.loadCompleted();
};

Tree.prototype.nodePrerenderers = {
  radial: function (tree, node) {
    if (node.parent) {
      node.startx = node.parent.centerx;
      node.starty = node.parent.centery;
    } else {
      node.startx = 0;
      node.starty = 0;
    }
    node.centerx = node.startx + (node.branchLength * tree.branchScalar * Math.cos(node.angle));
    node.centery = node.starty + (node.branchLength * tree.branchScalar * Math.sin(node.angle));

    for (var i = 0; i < node.children.length; i++) {
      this.radial(tree, node.children[i]);
    }
  }
};

Tree.prototype.nodeRenderers = {
  circle: function (node) {
    var r = node.getNodeSize();
    node.canvas.arc(r, 0, r, 0, Angles.FULL, false);
    node.canvas.stroke();
    node.canvas.fill();
  },
  square: function (node) {
    var r = node.getNodeSize();
    var x1 = 0;
    var x2 = r * 2;
    var y1 = -r;
    var y2 = r;
    node.canvas.moveTo(x1, y1);
    node.canvas.lineTo(x1, y2);
    node.canvas.lineTo(x2, y2);
    node.canvas.lineTo(x2, y1);
    node.canvas.lineTo(x1, y1);
    node.canvas.stroke();
    node.canvas.fill();
  },
  star: function (node) {
    var r = node.getNodeSize();
    var cx = r;
    var cy = 0;
    var spikes = 6;
    var outerRadius = 6;
    var innerRadius = 2;
    var rot = Math.PI / 2 * 3;
    var x = cx;
    var y = cy;
    var step = Math.PI / spikes;
    var i = 0;
    node.canvas.beginPath();
    node.canvas.moveTo(cx, cy - outerRadius);
    for (i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      node.canvas.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      node.canvas.lineTo(x, y);
      rot += step;
    }
    node.canvas.lineTo(cx, cy - outerRadius);
    node.canvas.stroke();
    node.canvas.fill();
    node.canvas.moveTo(cx, cy);
    node.canvas.lineTo(cx - (outerRadius - 1), cy);
    node.canvas.stroke();
    node.canvas.closePath();
  },
  triangle: function (node) {
    var r = node.getNodeSize();
    var cx = r;
    var cy = 0;
    var x1 = cx - r;
    var x2 = cx + r;
    var y1 = cy - r;
    var y2 = cy + r;
    node.canvas.moveTo(cx, y1);
    node.canvas.lineTo(x2, y2);
    node.canvas.lineTo(x1, y2);
    node.canvas.lineTo(cx, y1);
    node.canvas.stroke();
    node.canvas.fill();
    node.canvas.moveTo(x1, (y1 + y2) / 2);
    node.canvas.lineTo((x1 + x2) / 2, (y1 + y2) / 2);
    node.canvas.stroke();
  }
};

Tree.prototype.parseNexus = function (str, name) {
  if (!str.match(/^#NEXUS[\s\n;\w\.\*\/\:(\),-=\[\]&]+$/i)) {
    throw 'The string provided was not a nexus string';
  }
  else if (!str.match(/BEGIN TREES/gi)) {
    throw 'The nexus file does not contain a tree block';
  }

  //Get everything between BEGIN TREES and next END;
  var treeSection = str.match(/BEGIN TREES;[\S\s]+END;/i)[0].replace(/BEGIN TREES;\n/i, '').replace(/END;/i, '');
  //get translate section
  var translateSection = treeSection.match(/TRANSLATE[^;]+;/i)[0];

  //remove translate section from tree section
  treeSection = treeSection.replace(translateSection, '');
  //parse translate section into kv pairs
  translateSection = translateSection.replace(/translate|;/gi, '');

  var tIntArr = translateSection.split(',');
  var rObj = {};
  var ia;
  for (var i = 0; i < tIntArr.length; i++) {
    ia = tIntArr[i].replace('\n', '').split(' ');
    rObj[ia[0].trim()] = ia[1].trim();
  }

  // find each line starting with tree.
  var tArr = treeSection.split('\n');
  var trees = {};
  // id name is '' or does not exist, ask user to choose which tree.
  for (var i = 0; i < tArr.length; i++) {
    if (tArr[i].trim() === '') continue;
    var s = tArr[i].replace(/tree\s/i, '');
    trees[s.match(/^\w+/)[0]] = s.match(/ [\S]*$/)[0];
  }
  if (!trees[name]) throw 'tree ' + name + ' does not exist in this NEXUS file';

  this.parseNwk(trees[name].trim());
  // translate in accordance with translate block
  for (var n in rObj) {
    var b = this.branches[n];
    delete this.branches[n];
    b.id = rObj[n];
    this.branches[b.id] = b;
  }
};

Tree.prototype.parseNwk = function (nwk) {
  this.origBranches = false;
  this.origLeaves = false;
  this.origRoot = false;
  this.origBL = {};
  this.origP = {};

  this.root = false;
  this.leaves = [];
  this.branches = {};
  this.drawn = false;
  var curNode = new Branch();
  curNode.id = 'root';
  this.branches.root = curNode;
  this.setRoot(curNode);

  for (var i = 0; i < nwk.length; i++) {
    var node;
    switch (nwk[i]) {
      case '(': // new Child
        node = new Branch();
        curNode.addChild(node);
        curNode = node;
        break;
      case ')': // return to parent
        curNode = curNode.parent;
        break;
      case ',': // new sibiling
        node = new Branch();
        curNode.parent.addChild(node);
        curNode = node;
        break;
      case ';':
        for (var l = 0; l < this.leaves.length; l++) {
          if (this.leaves[l].totalBranchLength > this.maxBranchLength) {
            this.maxBranchLength = this.leaves[l].totalBranchLength;
          }
        }
        break;
      default:
        try {
          i = curNode.parseNwk(nwk, i);
          i--;
        } catch (e) {
          this.loadError('Error parsing nwk file' + e);
          return;
        }
        break;
    }
  }

  this.saveNode(this.root);
  this.root.saveChildren();

  this.root.branchLength = 0;
  this.maxBranchLength = 0;
  this.root.setTotalLength();

  if (this.maxBranchLength === 0) {
    this.loadError('All branches in the tree are identical.');
    return;
  }

  this.buildLeaves();

  this.loadCompleted();
};

Tree.prototype.pickup = function (event) {
  if (!this.drawn) return false;
  this.origx = this.offsetx;
  this.origy = this.offsety;

  if (event.button === 0) {
    this.pickedup = true;
  }

  if (event.button === 2 && this.rightClickZoom) {
    this.zoomPickedUp = true;
    this.origZoom = Math.log(this.zoom) / Math.log(10);
    this.oz = this.zoom;
    // position in the diagram on which you clicked
  }
  this.startx = event.clientX;
  this.starty = event.clientY;
};

Tree.prototype.prerenderers = {
  rectangular: function (tree, forcedDraw) {
    tree.root.startx = 0;
    tree.root.starty = 0;
    tree.root.centerx = 0;
    tree.root.centery = 0;
    tree.farthestNodeFromRootX = 0;
    tree.farthestNodeFromRootY = 0;

    // Calculate branchScalar based on canvas width and total branch length
    // This is used to transform the X coordinate based on the canvas width and no. of branches
    tree.branchScalar = tree.canvas.canvas.width / tree.maxBranchLength;
    // ystep is the vertical distance between 2 nodes
    var ystep = Math.max(tree.canvas.canvas.height / (tree.leaves.length + 2), (tree.leaves[0].getNodeSize() + 2) * 2);

    //set initial positons of the branches
    for (var i = 0; i < tree.leaves.length; i++) {
      tree.leaves[i].angle = 0; // for rectangle
      // Calculate and assign y coordinate for all the leaves
      tree.leaves[i].centery = (i > 0 ? tree.leaves[i - 1].centery + ystep : 0);
      tree.leaves[i].centerx = tree.leaves[i].totalBranchLength * tree.branchScalar;

      // Assign x,y position of the farthest node from the root
      if (tree.leaves[i].centerx > tree.farthestNodeFromRootX) {
        tree.farthestNodeFromRootX = tree.leaves[i].centerx;
      }
      if (tree.leaves[i].centery > tree.farthestNodeFromRootY) {
        tree.farthestNodeFromRootY = tree.leaves[i].centery;
      }

      // Calculate and assign y coordinate for all the parent branches
      for (var branch = tree.leaves[i]; branch.parent; branch = branch.parent) {
        // Get all the children of a parent
        var childrenArray = branch.parent.children;
        // Assign parent's y coordinate
        // Logic: Total ystep of all the children of this parent / 2
        branch.parent.centery = (childrenArray[0].centery + childrenArray[childrenArray.length - 1].centery) / 2;
      }
    }
    // Assign root startx and starty
    tree.root.startx = tree.root.centerx;
    tree.root.starty = tree.root.centery;
    // Set font size for tree and its branches
    tree.setFontSize(ystep);
    tree.setMaxLabelLength();
  },
  circular: function (tree) {
    tree.root.startx = 0;
    tree.root.starty = 0;
    tree.root.centerx = 0;
    tree.root.centery = 0;

    tree.branchScalar = Math.min(tree.canvas.canvas.width, tree.canvas.canvas.height) / tree.maxBranchLength;
    // work out radius of tree and the make branch scalar proportinal to the
    var r = (tree.leaves.length * tree.leaves[0].getNodeSize() * 2) / Angles.FULL;
    if (tree.branchScalar * tree.maxBranchLength > r) {
      r = tree.branchScalar * tree.maxBranchLength;
    } else {
      tree.branchScalar = r / tree.maxBranchLength;
    }

    var step = Angles.FULL / tree.leaves.length;

    for (var i = 0; i < tree.leaves.length; i++) {
      tree.leaves[i].angle = step * i;
      tree.leaves[i].centery = r * Math.sin(tree.leaves[i].angle);
      tree.leaves[i].centerx = r * Math.cos(tree.leaves[i].angle);
      tree.leaves[i].starty = ((tree.leaves[i].parent.totalBranchLength * tree.branchScalar)) * Math.sin(tree.leaves[i].angle);
      tree.leaves[i].startx = ((tree.leaves[i].parent.totalBranchLength * tree.branchScalar)) * Math.cos(tree.leaves[i].angle);
      tree.leaves[i].intery = ((tree.leaves[i].totalBranchLength * tree.branchScalar)) * Math.sin(tree.leaves[i].angle);
      tree.leaves[i].interx = ((tree.leaves[i].totalBranchLength * tree.branchScalar)) * Math.cos(tree.leaves[i].angle);
      for (var nd = tree.leaves[i]; nd.parent; nd = nd.parent) {
        if (nd.getChildNo() == 0) {
          nd.parent.angle = nd.angle;
          nd.parent.minChildAngle = nd.angle;
        }
        if (nd.getChildNo() == nd.parent.children.length - 1) {
          nd.parent.maxChildAngle = nd.angle;
          nd.parent.angle = (nd.parent.minChildAngle + nd.parent.maxChildAngle) / 2;
          nd.parent.centery = (nd.parent.totalBranchLength * tree.branchScalar) * Math.sin(nd.parent.angle);
          nd.parent.centerx = (nd.parent.totalBranchLength * tree.branchScalar) * Math.cos(nd.parent.angle);
          nd.parent.starty = ((nd.parent.totalBranchLength - nd.parent.branchLength) * tree.branchScalar) * Math.sin(nd.parent.angle);
          nd.parent.startx = ((nd.parent.totalBranchLength - nd.parent.branchLength) * tree.branchScalar) * Math.cos(nd.parent.angle);
        } else {
          break;
        }
      }
    }
    // Assign root startx and starty
    tree.root.startx = tree.root.centerx;
    tree.root.starty = tree.root.centery;
    // Set font size for tree and its branches
    tree.setFontSize(step);
    tree.setMaxLabelLength();
  },
  radial: function (tree, forcedDraw) {
    tree.branchScalar = Math.min(tree.canvas.canvas.width, tree.canvas.canvas.height) / tree.maxBranchLength;

    var step = Angles.FULL / tree.leaves.length;
    tree.root.startx = 0;
    tree.root.starty = 0;
    tree.root.centerx = 0;
    tree.root.centery = 0;

    for (var i = 0.0; i < tree.leaves.length; i += 1.0) {
      tree.leaves[i].angle = step * i;
      tree.leaves[i].centerx = tree.leaves[i].totalBranchLength * tree.branchScalar * Math.cos(tree.leaves[i].angle);
      tree.leaves[i].centery = tree.leaves[i].totalBranchLength * tree.branchScalar * Math.sin(tree.leaves[i].angle);

      for (var nd = tree.leaves[i]; nd.parent; nd = nd.parent) {
        if (nd.getChildNo() == 0) {
          nd.parent.angle = 0;
        }
        nd.parent.angle += (nd.angle * nd.getChildCount());
        if (nd.getChildNo() == nd.parent.children.length - 1) {
          nd.parent.angle = nd.parent.angle / nd.parent.getChildCount();
        } else {
          break;
        }
      }
    }
    // Assign root startx and starty
    tree.root.startx = tree.root.centerx;
    tree.root.starty = tree.root.centery;
    tree.nodePrerenderers.radial(tree, tree.root);
    // Set font size for tree and its branches
    tree.setFontSize(step);
    tree.setMaxLabelLength();
  },
  diagonal: function (tree, forceRender) {
    var ystep = Math.max(tree.canvas.canvas.height / (tree.leaves.length + 2), (tree.leaves[0].getNodeSize() + 2) * 2);
    tree.root.startx = 0;
    tree.root.starty = 0;
    tree.root.centerx = 0;
    tree.root.centery = 0;

    for (var i = 0; i < tree.leaves.length; i++) {
      tree.leaves[i].centerx = 0;
      tree.leaves[i].centery = (i > 0 ? tree.leaves[i - 1].centery + ystep : 0);
      tree.leaves[i].angle = 0;

      for (var nd = tree.leaves[i]; nd.parent; nd = nd.parent) {
        if (nd.getChildNo() == nd.parent.children.length - 1) {
          nd.parent.centery = nd.parent.getChildYTotal() / nd.parent.getChildCount(); // (nd.parent.children.length - 1);
          nd.parent.centerx = nd.parent.children[0].centerx + ((nd.parent.children[0].centery - nd.parent.centery) * Math.tan(Angles.FORTYFIVE));
          for (var j = 0; j < nd.parent.children.length; j++) {
            nd.parent.children[j].startx = nd.parent.centerx;
            nd.parent.children[j].starty = nd.parent.centery;
          }
        } else {
          break;
        }
      }
    }
    // Assign root startx and starty
    tree.root.startx = tree.root.centerx;
    tree.root.starty = tree.root.centery;
    // Set font size for tree and its branches
    tree.setFontSize(ystep);
    tree.setMaxLabelLength();
  },
  hierarchy: function (tree) {
    tree.root.startx = 0;
    tree.root.starty = 0;
    tree.root.centerx = 0;
    tree.root.centery = 0;
    tree.farthestNodeFromRootX = 0;
    tree.farthestNodeFromRootY = 0;

    tree.branchScalar = tree.canvas.canvas.height / tree.maxBranchLength;
    var xstep = Math.max(tree.canvas.canvas.width / (tree.leaves.length + 2),
                    (tree.leaves[0].getNodeSize() + 2) * 2);

    for (var i = 0; i < tree.leaves.length; i++) {
      tree.leaves[i].angle = Angles.QUARTER;
      tree.leaves[i].centerx = (i > 0 ? tree.leaves[i - 1].centerx + xstep : 0);
      tree.leaves[i].centery = tree.leaves[i].totalBranchLength * tree.branchScalar;

      for (var nd = tree.leaves[i]; nd.parent; nd = nd.parent) {
        if (nd.getChildNo() == 0) {
          nd.parent.centerx = nd.centerx;
        }

        if (nd.getChildNo() == nd.parent.children.length - 1) {
          nd.parent.angle = Angles.QUARTER;
          nd.parent.centerx = (nd.parent.centerx + nd.centerx) / 2;
          nd.parent.centery = nd.parent.totalBranchLength * tree.branchScalar;
          for (var j = 0; j < nd.parent.children.length; j++) {
            nd.parent.children[j].startx = nd.parent.centerx;
            nd.parent.children[j].starty = nd.parent.centery;
          }
        } else {
          break;
        }
      }
      // Assign x,y position of the farthest node from the root
      if (tree.leaves[i].centerx > tree.farthestNodeFromRootX) {
        tree.farthestNodeFromRootX = tree.leaves[i].centerx;
      }
      if (tree.leaves[i].centery > tree.farthestNodeFromRootY) {
        tree.farthestNodeFromRootY = tree.leaves[i].centery;
      }
    }
    // Assign root startx and starty
    tree.root.startx = tree.root.centerx;
    tree.root.starty = tree.root.centery;
    // Set font size for tree and its branches
    tree.setFontSize(xstep);
    tree.setMaxLabelLength();
  }
};

Tree.prototype.redrawGetNodes = function (node, leafIds) {
  for (var i = 0; i < node.children.length; i++) {
    this.branches[node.children[i].id] = node.children[i];
    if (node.children[i].leaf) {
      leafIds.push(node.children[i].id);
      this.leaves.push(node.children[i]);
    } else {
      this.redrawGetNodes(node.children[i], leafIds);
    }
  }
};

Tree.prototype.redrawFromBranch = function (node) {
  this.drawn = false;
  this.totalBranchLength = 0;

  this.resetTree();

  this.origBL[node.id] = node.branchLength;
  this.origP[node.id] = node.parent;

  this.root = node;
  this.root.branchLength = 0;
  this.root.parent = false;

  this.branches = {};
  this.leaves = [];
  var leafIds = [];

  for (var i = 0; i < this.root.children.length; i++) {
    this.branches[this.root.children[i].id] = this.root.children[i];
    if (this.root.children[i].leaf) {
      this.leaves.push(this.root.children[i]);
      leafIds.push(this.root.children[i].id);
    } else {
      this.redrawGetNodes(this.root.children[i], leafIds);
    }
  }

  this.root.setTotalLength();
  this.prerenderers[this.treeType](this);
  this.draw();
  this.subtreeDrawn(node.id);
};

Tree.prototype.redrawOriginalTree = function () {
  this.drawn = false;
  this.resetTree();

  this.root.setTotalLength();
  this.prerenderers[this.treeType](this);
  this.draw();

  this.subtreeDrawn(this.root.id);
};

Tree.prototype.saveNode = function (node) {
  if (!node.id || node.id === '') {
    node.id = node.tree.genId();
  }
  if (this.branches[node.id]) {
    if (node !== this.branches[node.id]) {
      if (!this.leaf) {
        node.id = this.genId();
        this.branches[node.id] = node;
      } else {
        throw 'Two nodes on this tree share the id ' + node.id;
      }
    }
  } else {
    this.branches[node.id] = node;
  }
};

Tree.prototype.scroll = function (e) {
  var z = Math.log(this.zoom) / Math.log(10);
  this.setZoom(z + (e.detail < 0 || e.wheelDelta > 0 ? 0.12 : -0.12));
  e.preventDefault();
};

Tree.prototype.selectNodes = function (nIds) {
  var ns = nIds;
  var node;
  var nodeId;
  var index;

  if (this.root) {
    this.root.setSelected(false, true);
    if (typeof nIds === 'string') {
      ns = ns.split(',');
    }
    for (nodeId in this.branches) {
      if (this.branches.hasOwnProperty(nodeId)) {
        node = this.branches[nodeId];
        for (index = 0; index < ns.length; index++) {
          if (ns[index] === node.id) {
            node.setSelected(true, true);
          }
        }
      }
    }
    this.draw();
  }
};

Tree.prototype.setFont = function (font) {
  if (isNaN(font)) {
    this.font = font;
    this.draw();
  }
};

Tree.prototype.setNodeColourAndShape = function (nids, colour, shape, size, waiting) {
  if (!nids) return;

  if (this.drawn) {
    var arr = [];
    if (typeof nids === 'string') {
      arr = nids.split(',');
    } else {
      arr = nids;
    }

    if (nids !== '') {
      for (var i = 0; i <  arr.length; i++) {
        if (this.branches[arr[i]]) {
          if (colour) {
            this.branches[arr[i]].colour = colour;
          }
          if (shape) {
            this.branches[arr[i]].nodeShape = Shapes[shape] ? Shapes[shape] : shape;
          }
          if (size) {
            this.branches[arr[i]].radius = size;
          }
        }
      }
      this.draw();
    }
  } else if (!waiting) {
    var _this = this;
    var timeout = setInterval(function () {
      if (this.drawn) {
        _this.setNodeColourAndShape(nids, colour, shape, size, true);
        clearInterval(timeout);
      }
    });
  }
};

Tree.prototype.setNodeSize = function (size) {
  this.baseNodeSize = Number(size);
  this.draw();
};

Tree.prototype.setRoot = function (node) {
  node.canvas = this.canvas;
  node.tree = this;
  this.root = node;
};

Tree.prototype.setTextSize = function (size) {
  this.textSize = Number(size);
  this.draw();
};

Tree.prototype.setFontSize = function (ystep) {
  // Setting tree text size
  if (this.treeType === 'circular') {
    this.textSize = Math.min((ystep * 100) + 5, 40);
  } else if (this.treeType === 'radial') {
    this.textSize = Math.min((ystep * 50) + 5, 20);
  } else if (this.treeType === 'diagonal') {
    this.textSize = Math.min((ystep / 2), 10);
  } else {
    this.textSize = Math.min((ystep / 2), 15);
  }
  this.canvas.font = this.textSize + 'pt ' + this.font;
};

Tree.prototype.setTreeType = function (type) {
  var oldType = this.treeType;
  this.treeType = type;
  if (this.drawn) {
    this.drawn = false;
    this.draw();
  }
  this.treeTypeChanged(oldType, type);
};

Tree.prototype.setSize = function (width, height) {
  this.canvas.canvas.width = width;
  this.canvas.canvas.height = height;
  if (this.navigator) {
    this.navigator.resize();
  }
  this.adjustForPixelRatio();
  if (this.drawn) {
    this.draw();
  }
};

Tree.prototype.setZoom = function (z) {
  if (z > -2 && z < 2) {
    var oz = this.zoom;
    this.zoom = Math.pow(10, z);

    this.offsetx = (this.offsetx / oz) * this.zoom;
    this.offsety = (this.offsety / oz) * this.zoom;

    this.draw();
  }
};

Tree.prototype.toggleLabels = function () {
  this.showLabels = !this.showLabels;
  this.draw();
};

Tree.prototype.translateClickX = function (x) {
  var ratio = (window.devicePixelRatio || 1) / getBackingStorePixelRatio(this.canvas);

  x = (x - getX(this.canvas.canvas) + window.pageXOffset);
  x *= ratio;
  x -= this.canvas.canvas.width / 2;
  x -= this.offsetx;
  x = x / this.zoom;

  return x;
};

Tree.prototype.translateClickY = function (y) {
  var ratio = (window.devicePixelRatio || 1) / getBackingStorePixelRatio(this.canvas);

  y = (y - getY(this.canvas.canvas) + window.pageYOffset); // account for positioning and scroll
  y *= ratio;
  y -= this.canvas.canvas.height / 2;
  y -= this.offsety;
  y = y / this.zoom;

  return y;
};

Tree.prototype.viewMetadataColumns = function (metadataColumnArray) {
  this.showMetadata = true;
  if (metadataColumnArray === undefined) {
    // Select all column headings so that it will draw all columns
    metadataColumnArray = this.getMetadataColumnHeadings();
  }
  // If argument missing or no key id matching, then this array would be undefined
  if (metadataColumnArray !== undefined) {
    this.selectedMetadataColumns = metadataColumnArray;
  }
  // Fit to canvas window
  this.fitInPanel();
  this.draw();
};

Tree.prototype.getMetadataColumnHeadings = function () {
  var metadataColumnArray = [];
  for (var i = 0; i < this.leaves.length; i++) {
    if (Object.keys(this.leaves[i].data).length > 0) {
      metadataColumnArray = Object.keys(this.leaves[i].data);
      break;
    }
  }
  return metadataColumnArray;
};

Tree.prototype.clearMetadata = function () {
  for (var i = 0; i < this.leaves.length; i++) {
    if (Object.keys(this.leaves[i].data).length > 0) {
      this.leaves[i].data = {};
    }
  }
};

Tree.prototype.setMaxLabelLength = function () {
  var dimensions;
  if (this.maxLabelLength[this.treeType] === undefined) {
    this.maxLabelLength[this.treeType] = 0;
  }

  for (var i = 0; i < this.leaves.length; i++) {
    dimensions = this.canvas.measureText(this.leaves[i].id);
    // finding the maximum label length
    if (dimensions.width > this.maxLabelLength[this.treeType]) {
      this.maxLabelLength[this.treeType] = dimensions.width;
    }
  }
};


Tree.prototype.loadCompleted = function () {
  fireEvent(this.canvasEl, 'loaded');
};

Tree.prototype.loadStarted = function () {
  fireEvent(this.canvasEl, 'loading');
};

Tree.prototype.loadError = function (message) {
  fireEvent(this.canvasEl, 'error', { message: message });
};

Tree.prototype.subtreeDrawn = function (node) {
  fireEvent(this.canvasEl, 'subtree', { node: node });
};

Tree.prototype.nodesSelected = function (nids) {
  fireEvent(this.canvasEl, 'selected', { nodeIds: nids });
};

Tree.prototype.addListener = function (event, listener) {
  addEvent(this.canvasEl, event, listener);
};

Tree.prototype.getBounds = function (leaves) {
  var minx;
  var maxx;
  var miny;
  var maxy;
  var index;
  var leafx;
  var leafy;
  var theta;
  var padding;

  if (!leaves || !leaves.length) {
    return [ [ 0, 0 ], [ 0, 0 ] ];
  }

  minx = leaves[0].minx || 0;
  maxx = leaves[0].maxx || 0;
  miny = leaves[0].miny || 0;
  maxy = leaves[0].maxy || 0;

  for (index = leaves.length; index--; ) {
    leafx = leaves[index].centerx;
    leafy = leaves[index].centery;
    theta = leaves[index].angle;
    padding = leaves[index].getNodeSize()
              + (this.showLabels ? this.maxLabelLength[this.treeType] + leaves[index].getLabelSize() : 0)
              + (this.showMetadata ? this.getMetadataColumnHeadings().length * this.metadataXStep : 0);

    leafx = leafx + (padding * Math.cos(theta));
    leafy = leafy + (padding * Math.sin(theta));

    minx = Math.min(minx, leafx);
    maxx = Math.max(maxx, leafx);
    miny = Math.min(miny, leafy);
    maxy = Math.max(maxy, leafy);
  }
  return [ [ minx, miny ], [ maxx, maxy ] ];
};

Tree.prototype.fitInPanel = function (bounds, padding) {
  var canvasSize;
  var minx;
  var maxx;
  var miny;
  var maxy;

  padding = padding || 50; // ES6 default param required
  bounds = bounds || this.getBounds(this.leaves); // ES6 default param required
  minx = bounds[0][0];
  maxx = bounds[1][0];
  miny = bounds[0][1];
  maxy = bounds[1][1];
  canvasSize = [
    this.canvas.canvas.width - padding,
    this.canvas.canvas.height - padding
  ];

  this.zoom = Math.min(
    canvasSize[0] / (maxx - minx),
    canvasSize[1] / (maxy - miny)
  );
  this.offsety = (maxy + miny) * this.zoom / -2;
  this.offsetx = (maxx + minx) * this.zoom / -2;
};

Tree.prototype.on = Tree.prototype.addListener;

Tree.prototype.adjustForPixelRatio = function () {
  // Adjust canvas size for Retina screen
  var ratio = (window.devicePixelRatio || 1) / getBackingStorePixelRatio(this.canvas);

  this.canvas.canvas.style.height = this.canvas.canvas.height + 'px';
  this.canvas.canvas.style.width = this.canvas.canvas.width + 'px';

  if (ratio > 1) {
    this.canvas.canvas.width *= ratio;
    this.canvas.canvas.height *= ratio;
  }
};

Tree.prototype.treeTypeChanged = function (oldType, newType) {
  fireEvent(this.canvasEl, 'typechanged', { oldType: oldType, newType: newType });
};

Tree.prototype.resetTree = function () {
  if (!this.origBranches) return;

  this.branches = this.origBranches;
  for (var n in this.origBL) {
    this.branches[n].branchLength = this.origBL[n];
    this.branches[n].parent = this.origP[n];
  }

  this.leaves = this.origLeaves;
  this.root = this.origRoot;
};

Tree.prototype.rotateBranch = function (branch) {
  this.branches[branch.id].rotate();
};

Tree.prototype.buildLeaves = function () {
  this.leaves = [];

  var leafIds = this.root.getChildIds();

  for (var i = 0; i < leafIds.length; i++) {
    this.leaves.push(this.branches[leafIds[i]]);
  }
};

Tree.prototype.exportNwk = function () {
  var nwk = this.root.getNwk();
  return nwk.substr(0, nwk.lastIndexOf(')') + 1) + ';';
};

Tree.prototype.resizeToContainer = function () {
  this.setSize(this.canvasEl.offsetWidth, this.canvasEl.offsetHeight);
  this.draw();
  this.history.resizeTree();
};

Tree.prototype.downloadAllLeafIds = function () {
  this.root.downloadLeafIdsFromBranch();
};

Tree.prototype.exportCurrentTreeView = function () {
  var dataUrl = this.getPngUrl();
  var anchor = document.createElement('a');
  var isDownloadSupported = (typeof anchor.download !== 'undefined');
  var event = document.createEvent('Event');

  anchor.href = dataUrl;
  anchor.target = '_blank';

  if (isDownloadSupported) {
    anchor.download = 'phylocanvas.png';
  }

  event.initEvent('click', true, true);
  anchor.dispatchEvent(event);

  if (isDownloadSupported) {
    (window.URL || window.webkitURL).revokeObjectURL(anchor.href);
  }
};

Tree.prototype.zoomToSelectedNodes = function () {
  var selectedNodes = this.root.getSelected();
  if (!selectedNodes.length) {
    return;
  }
  this.fitInPanel(this.getBounds(selectedNodes), 200);
  this.draw();
};

module.exports = Tree;
