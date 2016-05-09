import { dom, events, canvas } from './utils';

import Branch from './Branch';
import { ChildNodesTooltip as Tooltip } from './Tooltip';
import Navigator from './Navigator';

import treeTypes from './treeTypes';
import parsers from './parsers';

const { addClass } = dom;
const { fireEvent, addEvent } = events;
const { getPixelRatio, translateClick } = canvas;


/**
 * The instance of a PhyloCanvas Widget
 *
 * @constructor
 * @memberof PhyloCanvas
 * @param element {string|HTMLElement} the element or id of an element that phylocanvas
 * will be drawn in
 *
 * {@link PhyoCanvas.Tree}
 *
 * @example
 *  new PhyloCanvas.Tree('element_id');
 *
 * @example
 *  new PhyloCanvas.Tree(element);
 */
export default class Tree {

  constructor(element, config = {}) {
    this.containerElement =
      (typeof element === 'string' ? document.getElementById(element) : element);
    addClass(this.containerElement, 'pc-container');
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
     * The root node of the tree
     * (not neccesarily a root in the Phylogenetic sense)
     */
    this.root = false;

    this.stringRepresentation = '';

    /**
     * backColour colour the branches of the tree based on the colour of the
     * tips
     */
    this.backColour = false;

    this.originalTree = {};

    // Set up the element and canvas
    if (window.getComputedStyle(this.containerElement).position === 'static') {
      this.containerElement.style.position = 'relative';
    }
    this.containerElement.style.boxSizing = 'border-box';

    const canvasElement = document.createElement('canvas');
    canvasElement.id = (this.containerElement.id || '') + '__canvas';
    canvasElement.className = 'phylocanvas';
    canvasElement.style.position = 'relative';
    canvasElement.height = element.offsetHeight || 400;
    canvasElement.width = element.offsetWidth || 400;
    canvasElement.style.zIndex = '1';
    this.containerElement.appendChild(canvasElement);

    this.defaultCollapsed = {};

    this.tooltip = new Tooltip(this);

    this.drawn = false;

    this.highlighters = [];

    this.zoom = 1;
    this.zoomFactor = 0.1;
    this.disableZoom = false;

    this.fillCanvas = false;

    this.branchScaling = true;
    this.currentBranchScale = 1;
    this.branchScalingStep = 1.2;

    this.pickedup = false;
    this.dragging = false;
    this.startx = null; this.starty = null;
    this.pickedup = false;
    this.baseNodeSize = 1;
    this.curx = null;
    this.cury = null;
    this.origx = null;
    this.origy = null;

    this.canvas = canvasElement.getContext('2d');

    this.canvas.canvas.onselectstart = function () { return false; };
    this.canvas.fillStyle = '#000000';
    this.canvas.strokeStyle = '#000000';
    this.canvas.save();

    this.offsetx = this.canvas.canvas.width / 2;
    this.offsety = this.canvas.canvas.height / 2;
    this.selectedColour = 'rgba(49,151,245,1)';
    this.highlightColour = 'rgba(49,151,245,1)';
    this.highlightWidth = 4;
    this.highlightSize = 2;
    this.selectedNodeSizeIncrease = 0;
    this.branchColour = 'rgba(0,0,0,1)';
    this.branchScalar = 1.0;
    this.padding = 50;
    this.labelPadding = 5;

    this.multiSelect = true;
    this.clickFlag = 'selected';
    this.clickFlagPredicate = () => true;
    this.hoverLabel = false;
    this.internalNodesSelectable = true;

    this.showLabels = true;
    this.showBootstraps = false;

    this.setTreeType('radial');
    this.maxBranchLength = 0;
    this.lineWidth = 1.0;
    this.textSize = 7;
    this.font = 'sans-serif';

    this.unselectOnClickAway = true;

    if (this.useNavigator) {
      this.navigator = new Navigator(this);
    }

    /**
     * Align labels vertically
     */
    this.alignLabels = false;

    /**
     * X and Y axes of the node that is farther from the root
     * Used to align labels vertically
     */
    this.farthestNodeFromRootX = 0;
    this.farthestNodeFromRootY = 0;

    /**
     * Maximum length of label for each tree type.
     */
    this.maxLabelLength = {};


    /**
     * Override properties from config
     */
    Object.assign(this, config);


    this.resizeToContainer();

    this.addListener('click', this.clicked.bind(this));

    this.addListener('mousedown', this.pickup.bind(this));
    this.addListener('mouseup', this.drop.bind(this));
    this.addListener('mouseout', this.drop.bind(this));

    addEvent(this.canvas.canvas, 'mousemove', this.drag.bind(this));
    if (!this.disableZoom) {
      addEvent(this.canvas.canvas, 'mousewheel', this.scroll.bind(this));
      addEvent(this.canvas.canvas, 'DOMMouseScroll', this.scroll.bind(this));
    }
    addEvent(window, 'resize', () => {
      this.resizeToContainer();
      this.draw();
    });
  }

  get alignLabels() {
    return this.showLabels && this.labelAlign && this.labelAlignEnabled;
  }

  set alignLabels(value) {
    this.labelAlignEnabled = value;
  }

  setInitialCollapsedBranches(node = this.root) {
    var childIds;
    var i;

    childIds = node.getChildProperties('id');
    if (childIds && childIds.length > this.defaultCollapsed.min &&
        childIds.length < this.defaultCollapsed.max) {
      node.collapsed = true;
      return;
    }

    for (i = 0; i < node.children.length; i++) {
      this.setInitialCollapsedBranches(node.children[i]);
    }
  }

  getNodeAtMousePosition(event) {
    return this.root.clicked(...translateClick(event, this));
  }

  getSelectedNodeIds() {
    return this.getNodeIdsWithFlag('selected');
  }

  getNodeIdsWithFlag(flag, value = true) {
    return this.leaves.reduce((memo, leaf) => {
      if (leaf[flag] === value) {
        memo.push(leaf.id);
      }
      return memo;
    }, []);
  }

  clicked(e) {
    var node;
    if (e.button === 0) {
      let nodeIds = [];
      // if this is triggered by the release after a drag then the click
      // shouldn't be triggered.
      if (this.dragging) {
        this.dragging = false;
        return;
      }

      if (!this.root) return false;
      node = this.getNodeAtMousePosition(e);
      const isMultiSelectActive = this.multiSelect && (e.metaKey || e.ctrlKey);
      if (node && node.interactive) {
        if (isMultiSelectActive) {
          if (node.leaf) {
            node[this.clickFlag] = !node[this.clickFlag];
          } else if (this.internalNodesSelectable) {
            const someUnflagged = node.getChildProperties(this.clickFlag).some(prop => prop === false);
            node.cascadeFlag(this.clickFlag, someUnflagged, this.clickFlagPredicate);
          }
          nodeIds = this.getNodeIdsWithFlag(this.clickFlag);
          this.draw();
        } else {
          this.root.cascadeFlag(this.clickFlag, false, this.clickFlagPredicate);
          if (this.internalNodesSelectable || node.leaf) {
            node.cascadeFlag(this.clickFlag, true, this.clickFlagPredicate);
            nodeIds = node.getChildProperties('id');
          }
          this.draw();
        }
      } else if (this.unselectOnClickAway && !this.dragging && !isMultiSelectActive) {
        this.root.cascadeFlag(this.clickFlag, false, this.clickFlagPredicate);
        this.draw();
      }

      if (!this.pickedup) {
        this.dragging = false;
      }

      this.nodesUpdated(nodeIds, this.clickFlag);
    }
  }

  dblclicked(e) {
    if (!this.root) return false;
    var nd = this.getNodeAtMousePosition(e);
    if (nd) {
      nd.cascadeFlag('selected', false);
      nd.toggleCollapsed();
    }

    if (!this.pickedup) {
      this.dragging = false;
    }
    this.draw();
  }

  displayLabels() {
    this.showLabels = true;
    this.draw();
  }

  drag(event) {
    // get window ratio
    const ratio = getPixelRatio(this.canvas);

    if (!this.drawn) return false;

    if (this.pickedup) {
      const xmove = (event.clientX - this.startx) * ratio;
      const ymove = (event.clientY - this.starty) * ratio;
      if (Math.abs(xmove) + Math.abs(ymove) > 5) {
        this.dragging = true;
        this.offsetx = this.origx + xmove;
        this.offsety = this.origy + ymove;
        this.draw();
      }
    } else {
      // hover
      const e = event;
      const nd = this.getNodeAtMousePosition(e);

      if (nd && nd.interactive && (this.internalNodesSelectable || nd.leaf)) {
        this.root.cascadeFlag('hovered', false);
        nd.hovered = true;
        // For mouseover tooltip to show no. of children on the internal nodes
        if (!nd.leaf && !nd.hasCollapsedAncestor()) {
          this.tooltip.open(e.clientX, e.clientY, nd);
        }
        this.containerElement.style.cursor = 'pointer';
      } else {
        this.tooltip.close();
        this.root.cascadeFlag('hovered', false);
        this.containerElement.style.cursor = 'auto';
      }
      this.draw();
    }
  }

  /**
   * Draw the frame - Had to add svg bool to make svg output work - Simon
   */
  draw(forceRedraw, svg = false) {
    this.highlighters.length = 0;

    if (this.maxBranchLength === 0) {
      this.loadError(new Error('All branches in the tree are identical.'));
      return;
    }

    this.canvas.restore();

    // Had to add this to make svg output work. cearRect clears the clip mask applied in Phandango
    if (svg === false) {
      this.canvas.clearRect(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
    }
    // End of Simon's additions

    this.canvas.lineCap = 'round';
    this.canvas.lineJoin = 'round';

    this.canvas.strokeStyle = this.branchColour;
    this.canvas.save();


    if (!this.drawn || forceRedraw) {
      this.prerenderer.run(this);
      if (!forceRedraw) {
        this.fitInPanel();
      }
    }
    const pixelRatio = getPixelRatio(this.canvas);
    this.canvas.lineWidth = this.lineWidth / this.zoom;
    this.canvas.translate(this.offsetx * pixelRatio, this.offsety * pixelRatio);
    this.canvas.scale(this.zoom, this.zoom);
    this.branchRenderer.render(this, this.root);

    this.highlighters.forEach(render => render());

    this.drawn = true;

    // Had to add this to make svg output work. No idea why I can't restore outside of phylocanvas, but it doesn't work
    if (svg === true) {
      this.canvas.restore();
    }
    // End of Simon's additions
  }

  drop() {
    if (!this.drawn) return false;
    this.pickedup = false;
  }

  findLeaves(pattern, searchProperty = 'id') {
    let foundLeaves = [];

    for (let leaf of this.leaves) {
      if (leaf[searchProperty] && leaf[searchProperty].match(pattern)) {
        foundLeaves.push(leaf);
      }
    }

    return foundLeaves;
  }

  updateLeaves(leaves, property, value) {
    for (let leaf of this.leaves) {
      leaf[property] = !value;
    }

    for (let leaf of leaves) {
      leaf[property] = value;
    }
    this.nodesUpdated(leaves.map(_ => _.id), property);
  }

  clearSelect() {
    this.root.cascadeFlag('selected', false);
    this.draw();
  }

  getPngUrl() {
    return this.canvas.canvas.toDataURL();
  }

  hideLabels() {
    this.showLabels = false;
    this.draw();
  }

  load(inputString, options = {}, callback) {
    let buildOptions = options;
    let buildCallback = callback;

    // allows passing callback as second param
    if (typeof options === 'function') {
      buildCallback = options;
      buildOptions = {};
    }

    if (buildCallback) {
      buildOptions.callback = buildCallback;
    }

    if (buildOptions.format) {
      this.build(inputString, parsers[buildOptions.format], buildOptions);
      return;
    }

    for (const parserName of Object.keys(parsers)) {
      const parser = parsers[parserName];

      if (inputString.match(parser.fileExtension) ||
          inputString.match(parser.validator)) {
        this.build(inputString, parser, buildOptions);
        return;
      }
    }

    const error = new Error('String not recognised as a file or a parseable format string');
    if (buildCallback) {
      buildCallback(error);
    }
    this.loadError(error);
  }

  saveOriginalTree() {
    this.originalTree.branches = this.branches;
    this.originalTree.leaves = this.leaves;
    this.originalTree.root = this.root;
    this.originalTree.branchLengths = {};
    this.originalTree.parents = {};
  }

  clearState() {
    this.root = false;
    this.leaves = [];
    this.branches = {};
    this.drawn = false;
  }

  saveState() {
    this.extractNestedBranches();

    this.root.branchLength = 0;
    this.maxBranchLength = 0;
    this.root.setTotalLength();

    if (this.maxBranchLength === 0) {
      this.loadError(new Error('All branches in the tree are identical.'));
      return;
    }
  }

  build(formatString, parser, options) {
    this.originalTree = {};
    this.clearState();
    Branch.lastId = 0;

    const root = new Branch();
    root.id = 'root';
    this.branches.root = root;
    this.setRoot(root);

    parser.parse({ formatString, root, options }, (error) => {
      if (error) {
        if (options.callback) {
          options.callback(error);
        }
        this.loadError(error);
        return;
      }
      this.stringRepresentation = formatString;
      this.saveState();
      this.setInitialCollapsedBranches();
      this.draw();
      this.saveOriginalTree();
      if (options.callback) {
        options.callback();
      }

      this.loadCompleted();
    });
  }

  pickup(event) {
    if (!this.drawn) return false;
    this.origx = this.offsetx;
    this.origy = this.offsety;

    if (event.button === 0) {
      this.pickedup = true;
    }

    this.startx = event.clientX;
    this.starty = event.clientY;
  }

  redrawFromBranch(node) {
    this.clearState();
    this.resetTree();

    this.originalTree.branchLengths[node.id] = node.branchLength;
    this.originalTree.parents[node.id] = node.parent;

    this.root = node;
    this.root.parent = false;

    this.saveState();

    this.draw();
    this.subtreeDrawn(node.id);
  }

  redrawOriginalTree() {
    this.load(this.stringRepresentation);
  }

  storeNode(node) {
    if (!node.id || node.id === '') {
      node.id = Branch.generateId();
    }

    if (this.branches[node.id]) {
      if (node !== this.branches[node.id]) {
        if (!node.leaf) {
          node.id = Branch.generateId();
        } else {
          throw new Error('Two nodes on this tree share the id ' + node.id);
        }
      }
    }

    this.branches[node.id] = node;

    if (node.leaf) {
      this.leaves.push(node);
    }
  }

  scroll(event) {
    event.preventDefault();

    if (this._zooming || ('wheelDelta' in event && event.wheelDelta === 0)) {
      return;
    }

    const sign = event.detail < 0 || event.wheelDelta > 0 ? 1 : -1;
    if(this.branchScaling && (event.metaKey || event.ctrlKey)) {
      this.currentBranchScale *= Math.pow(this.branchScalingStep, sign);
      this.setBranchScale(this.currentBranchScale, { x: event.offsetX, y: event.offsetY });
    } else {
      const newZoom = (Math.log(this.zoom) / Math.log(10)) + sign * this.zoomFactor;
      this.setZoom(newZoom, event.offsetX, event.offsetY);
    }
    this._zooming = true;
    setTimeout(() => { this._zooming = false; }, 128);
  }

  selectNodes(nIds) {
    var ns = nIds;
    var node;
    var nodeId;
    var index;

    if (this.root) {
      this.root.cascadeFlag('selected', false);
      if (typeof nIds === 'string') {
        ns = ns.split(',');
      }
      for (nodeId in this.branches) {
        if (this.branches.hasOwnProperty(nodeId)) {
          node = this.branches[nodeId];
          for (index = 0; index < ns.length; index++) {
            if (ns[index] === node.id) {
              node.cascadeFlag('selected', true);
            }
          }
        }
      }
      this.draw();
    }
  }

  setFont(font) {
    if (isNaN(font)) {
      this.font = font;
      this.draw();
    }
  }

  setNodeDisplay(ids, options, waiting) {
    if (!ids) return;

    if (this.drawn) {
      let array = [];
      if (typeof ids === 'string') {
        array = ids.split(',');
      } else {
        array = ids;
      }

      if (array.length) {
        for (let id of array) {
          if (!(id in this.branches)) {
            continue;
          }
          this.branches[id].setDisplay(options);
        }
        this.draw();
      }
    } else if (!waiting) {
      let _this = this;
      let timeout = setInterval(function () {
        if (this.drawn) {
          _this.setNodeColourAndShape(ids, options, true);
          clearInterval(timeout);
        }
      });
    }
  }

  setNodeSize(size) {
    this.baseNodeSize = Number(size);
    this.draw();
  }

  setRoot(node) {
    node.canvas = this.canvas;
    node.tree = this;
    this.root = node;
  }

  setTextSize(size) {
    this.textSize = Number(size);
    this.draw();
  }

  setFontSize(ystep) {
    this.textSize = this.calculateFontSize ? this.calculateFontSize(ystep) : Math.min((ystep / 2), 15);
    this.canvas.font = this.textSize + 'pt ' + this.font;
  }

  setTreeType(type, quiet) {
    if (!(type in treeTypes)) {
      return fireEvent(this.containerElement, 'error', { error: new Error(`"${type}" is not a known tree-type.`) });
    }

    let oldType = this.treeType;
    this.treeType = type;

    this.branchRenderer = treeTypes[type].branchRenderer;
    this.prerenderer = treeTypes[type].prerenderer;
    this.labelAlign = treeTypes[type].labelAlign;
    this.scaleCollapsedNode = treeTypes[type].scaleCollapsedNode;
    this.calculateFontSize = treeTypes[type].calculateFontSize;

    if (this.drawn) {
      this.drawn = false;
      this.draw();
    }

    if (!quiet) {
      this.treeTypeChanged(oldType, type);
    }
  }

  setSize(width, height) {
    this.canvas.canvas.width = width;
    this.canvas.canvas.height = height;
    if (this.navigator) {
      this.navigator.resize();
    }
    this.adjustForPixelRatio();
  }

  setZoom(z, zoomPointX = (this.canvas.canvas.width / 2), zoomPointY = (this.canvas.canvas.height / 2)) {
    if (z > -2 && z < 2) {
      const oldZoom = this.zoom;
      const newZoom = Math.pow(10, z);
      this.zoom = newZoom;
      this.offsetx = this.calculateZoomedOffset(this.offsetx, zoomPointX, oldZoom, newZoom);
      this.offsety = this.calculateZoomedOffset(this.offsety, zoomPointY, oldZoom, newZoom);
      this.draw();
    }
  }

  calculateZoomedOffset(offset, point, oldZoom, newZoom) {
    return -1 * ((((-1 * offset) + point) / oldZoom * newZoom) - point);
  }

  setBranchScale(scale = 1, point = { x: this.canvas.canvas.width / 2, y: this.canvas.canvas.height / 2 }) {
    const treeType = treeTypes[this.treeType];
    if (!treeType.branchScalingAxis || scale < 0) {
      return;
    }

    const previoudBranchLength = this.branchScalar;
    this.branchScalar = this.initialBranchScalar * scale;
    const scaleRatio = this.branchScalar / previoudBranchLength;
    const offset = this[`offset${treeType.branchScalingAxis}`];
    const oldPosition = point[treeType.branchScalingAxis];
    const newPosition = (point[treeType.branchScalingAxis] - offset) * scaleRatio + offset;
    this[`offset${treeType.branchScalingAxis}`] += (oldPosition - newPosition);
    this.draw();
  }

  toggleLabels() {
    this.showLabels = !this.showLabels;
    this.draw();
  }

  setMaxLabelLength() {
    var dimensions;
    if (this.maxLabelLength[this.treeType] === undefined) {
      this.maxLabelLength[this.treeType] = 0;
    }

    for (let i = 0; i < this.leaves.length; i++) {
      dimensions = this.canvas.measureText(this.leaves[i].id);
      // finding the maximum label length
      if (dimensions.width > this.maxLabelLength[this.treeType]) {
        this.maxLabelLength[this.treeType] = dimensions.width;
      }
    }
  }


  loadCompleted() {
    fireEvent(this.containerElement, 'loaded');
  }

  loadStarted() {
    fireEvent(this.containerElement, 'loading');
  }

  loadError(error) {
    fireEvent(this.containerElement, 'error', { error });
  }

  subtreeDrawn(node) {
    fireEvent(this.containerElement, 'subtree', { node });
  }

  nodesUpdated(nodeIds, property, append = false) {
    fireEvent(this.containerElement, 'updated', { nodeIds, property, append });
  }

  addListener(event, listener) {
    addEvent(this.containerElement, event, listener);
  }

  getBounds(leaves = this.leaves) {
    let minx = leaves[0].startx;
    let maxx = leaves[0].startx;
    let miny = leaves[0].starty;
    let maxy = leaves[0].starty;

    for (const leaf of leaves) {
      const bounds = leaf.getBounds();
      minx = Math.min(minx, bounds.minx);
      maxx = Math.max(maxx, bounds.maxx);
      miny = Math.min(miny, bounds.miny);
      maxy = Math.max(maxy, bounds.maxy);
    }
    return [ [ minx, miny ], [ maxx, maxy ] ];
  }

  fitInPanel(bounds = this.getBounds()) {
    const canvasSize = [
      this.canvas.canvas.width - this.padding * 2,
      this.canvas.canvas.height - this.padding * 2,
    ];
    const treeSize = [
      bounds[1][0] - bounds[0][0],
      bounds[1][1] - bounds[0][1],
    ];
    const pixelRatio = getPixelRatio(this.canvas);
    const xZoomRatio = canvasSize[0] / treeSize[0];
    const yZoomRatio = canvasSize[1] / treeSize[1];
    this.zoom = Math.min(xZoomRatio, yZoomRatio);
    this.offsetx = (-1 * bounds[0][0]) * this.zoom;
    this.offsety = (-1 * bounds[0][1]) * this.zoom;
    if (xZoomRatio > yZoomRatio) {
      this.offsetx += this.padding +
                      (canvasSize[0] - (treeSize[0] * this.zoom)) / 2;
      this.offsety += this.padding;
    } else {
      this.offsetx += this.padding;
      this.offsety += this.padding +
                      (canvasSize[1] - (treeSize[1] * this.zoom)) / 2;
    }
    this.offsetx = this.offsetx / pixelRatio;
    this.offsety = this.offsety / pixelRatio;
  }

  adjustForPixelRatio() {
    var ratio = getPixelRatio(this.canvas);

    this.canvas.canvas.style.height = this.canvas.canvas.height + 'px';
    this.canvas.canvas.style.width = this.canvas.canvas.width + 'px';

    if (ratio > 1) {
      this.canvas.canvas.width *= ratio;
      this.canvas.canvas.height *= ratio;
    }
  }

  treeTypeChanged(oldType, newType) {
    fireEvent(this.containerElement, 'typechanged', { oldType: oldType, newType: newType });
  }

  resetTree() {
    if (!this.originalTree.branches) return;

    this.branches = this.originalTree.branches;
    for (let n of Object.keys(this.originalTree.branchLengths)) {
      this.branches[n].branchLength = this.originalTree.branchLengths[n];
      this.branches[n].parent = this.originalTree.parents[n];
    }

    this.leaves = this.originalTree.leaves;
    this.root = this.originalTree.root;
  }

  rotateBranch(branch) {
    this.branches[branch.id].rotate();
  }

  extractNestedBranches() {
    this.branches = {};
    this.leaves = [];

    this.storeNode(this.root);
    this.root.extractChildren();
  }

  exportNwk() {
    var nwk = this.root.getNwk();
    return nwk.substr(0, nwk.lastIndexOf(')') + 1) + ';';
  }

  resizeToContainer() {
    this.setSize(this.containerElement.offsetWidth, this.containerElement.offsetHeight);
  }
}

Tree.prototype.on = Tree.prototype.addListener;
