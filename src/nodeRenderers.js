import { constants } from 'phylocanvas-utils';

const { Angles } = constants;

function commitPath(canvas, { lineWidth, strokeStyle, fillStyle }) {
  canvas.save();

  canvas.lineWidth = lineWidth;
  canvas.strokeStyle = strokeStyle;
  canvas.fillStyle = fillStyle;

  canvas.fill();
  if (lineWidth > 0) {
    canvas.stroke();
  }

  canvas.restore();
}

export default {

  circle(canvas, radius, style) {
    canvas.beginPath();
    canvas.arc(radius, 0, radius, 0, Angles.FULL, false);
    canvas.closePath();

    commitPath(canvas, style);
  },

  square(canvas, radius, style) {
    const areaOfShape = Math.PI * Math.pow(radius, 2);

    // square
    const lengthOfSide = Math.sqrt(areaOfShape);
    const startX = radius - lengthOfSide / 2;

    canvas.beginPath();
    canvas.moveTo(startX, 0);
    canvas.lineTo(startX, lengthOfSide / 2);
    canvas.lineTo(startX + lengthOfSide, lengthOfSide / 2);
    canvas.lineTo(startX + lengthOfSide, -lengthOfSide / 2);
    canvas.lineTo(startX, -lengthOfSide / 2);
    canvas.lineTo(startX, 0);
    canvas.closePath();

    commitPath(canvas, style);
  },

  star(canvas, radius, style) {
    const cx = radius;
    const cy = 0;
    const spikes = 5;
    const outerRadius = radius + radius * (1 / spikes);
    const innerRadius = outerRadius / 2;
    const step = Math.PI / spikes;

    let rot = Math.PI / 2 * 3;

    canvas.beginPath();
    canvas.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      canvas.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      canvas.lineTo(x, y);
      rot += step;
    }
    canvas.lineTo(cx, cy - outerRadius);
    canvas.closePath();

    commitPath(canvas, style);
  },

  triangle(canvas, radius, style) {
    const areaOfShape = Math.PI * Math.pow(radius, 2);

    // triangle
    const lengthOfSide = Math.sqrt(
      areaOfShape / (Math.sqrt(3) / 4)
    );
    const height = (Math.sqrt(3) / 2) * lengthOfSide;
    const midpoint = (1 / Math.sqrt(3)) * (lengthOfSide / 2);

    canvas.beginPath();
    canvas.moveTo(radius, midpoint);
    canvas.lineTo(radius + lengthOfSide / 2, midpoint);
    canvas.lineTo(radius, -(height - midpoint));
    canvas.lineTo(radius - lengthOfSide / 2, midpoint);
    canvas.lineTo(radius, midpoint);
    canvas.closePath();

    commitPath(canvas, style);
  },

};
