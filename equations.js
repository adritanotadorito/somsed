function formatNum(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  if (Math.abs(num) < 1e-6) return '0';
  const rounded = Number(num.toFixed(decimals));
  if (Object.is(rounded, -0)) return '0';
  return rounded.toString();
}

function formatShiftedVar(varName, offset, decimals = 2) {
  if (offset === null || offset === undefined || isNaN(offset) || Math.abs(offset) < 1e-6) {
    return { latex: varName, text: varName, isZero: true };
  }
  const absValStr = formatNum(Math.abs(offset), decimals);
  if (absValStr === '0') {
    return { latex: varName, text: varName, isZero: true };
  }
  if (offset > 0) {
    return {
      latex: `(${varName} - ${absValStr})`,
      text: `(${varName} - ${absValStr})`,
      isZero: false
    };
  } else {
    return {
      latex: `(${varName} + ${absValStr})`,
      text: `(${varName} + ${absValStr})`,
      isZero: false
    };
  }
}

function formatSquaredTerm(varName, offset, decimals = 2) {
  const shifted = formatShiftedVar(varName, offset, decimals);
  if (shifted.isZero) {
    return {
      latex: `${varName}^2`,
      text: `${varName}²`
    };
  }
  return {
    latex: `${shifted.latex}^2`,
    text: `${shifted.text}²`
  };
}

function deriveLineSegmentEquation(p1, p2, decimals = 2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);

  if (len < 1e-4) {
    const xStr = formatNum(p1.x, decimals);
    const yStr = formatNum(p1.y, decimals);
    return {
      type: 'point',
      point: { x: p1.x, y: p1.y },
      latex: `(x, y) = (${xStr}, ${yStr})`,
      text: `(x, y) = (${xStr}, ${yStr})`,
      fullPrecision: { x: p1.x, y: p1.y }
    };
  }

  if (Math.abs(dx) < 1e-4) {
    const cVal = (p1.x + p2.x) / 2;
    const cStr = formatNum(cVal, decimals);
    const yMin = Math.min(p1.y, p2.y);
    const yMax = Math.max(p1.y, p2.y);
    const yMinStr = formatNum(yMin, decimals);
    const yMaxStr = formatNum(yMax, decimals);

    return {
      type: 'vertical_line',
      c: cVal,
      range: [yMin, yMax],
      latex: `x = ${cStr} \\quad \\left\\{ ${yMinStr} \\le y \\le ${yMaxStr} \\right\\}`,
      text: `x = ${cStr}  {${yMinStr} <= y <= ${yMaxStr}}`,
      fullPrecision: { c: cVal, yMin, yMax }
    };
  }

  const m = dy / dx;
  const b = p1.y - m * p1.x;
  const xMin = Math.min(p1.x, p2.x);
  const xMax = Math.max(p1.x, p2.x);
  const xMinStr = formatNum(xMin, decimals);
  const xMaxStr = formatNum(xMax, decimals);

  if (Math.abs(m) < 1e-4) {
    const bStr = formatNum(b, decimals);
    return {
      type: 'horizontal_line',
      m: 0,
      b,
      domain: [xMin, xMax],
      latex: `y = ${bStr} \\quad \\left\\{ ${xMinStr} \\le x \\le ${xMaxStr} \\right\\}`,
      text: `y = ${bStr}  {${xMinStr} <= x <= ${xMaxStr}}`,
      fullPrecision: { m: 0, b, xMin, xMax }
    };
  }

  let mStr = '';
  if (Math.abs(m - 1) < 1e-4) {
    mStr = 'x';
  } else if (Math.abs(m - (-1)) < 1e-4) {
    mStr = '-x';
  } else {
    mStr = `${formatNum(m, decimals)}x`;
  }

  let bStr = '';
  const absBStr = formatNum(Math.abs(b), decimals);
  if (absBStr !== '0') {
    if (b > 0) {
      bStr = ` + ${absBStr}`;
    } else {
      bStr = ` - ${absBStr}`;
    }
  }

  const exprLatex = `${mStr}${bStr}`;
  const exprText = `${mStr}${bStr}`;

  return {
    type: 'line',
    m,
    b,
    domain: [xMin, xMax],
    latex: `y = ${exprLatex} \\quad \\left\\{ ${xMinStr} \\le x \\le ${xMaxStr} \\right\\}`,
    text: `y = ${exprText}  {${xMinStr} <= x <= ${xMaxStr}}`,
    fullPrecision: { m, b, xMin, xMax }
  };
}

function deriveCircleEquation(center, radius, decimals = 2) {
  const h = center.x;
  const k = center.y;
  const r = radius;
  const r2 = r * r;

  const termX = formatSquaredTerm('x', h, decimals);
  const termY = formatSquaredTerm('y', k, decimals);
  const r2Str = formatNum(r2, decimals);
  const rStr = formatNum(r, decimals);
  const hStr = formatNum(h, decimals);
  const kStr = formatNum(k, decimals);

  return {
    type: 'circle',
    center: { x: h, y: k },
    radius: r,
    latex: `${termX.latex} + ${termY.latex} = ${r2Str}`,
    text: `${termX.text} + ${termY.text} = ${r2Str}`,
    detailsLatex: `\\text{Center } (${hStr}, ${kStr}), \\; r = ${rStr}`,
    detailsText: `Center (${hStr}, ${kStr}), r = ${rStr}`,
    fullPrecision: { h, k, r, r2 }
  };
}

function deriveEllipseEquation(center, radiusX, radiusY, canvasRotation = 0, decimals = 2) {
  const h = center.x;
  const k = center.y;
  const a = radiusX;
  const b = radiusY;
  const a2 = a * a;
  const b2 = b * b;

  let graphRot = -canvasRotation;
  while (graphRot > Math.PI / 2) graphRot -= Math.PI;
  while (graphRot <= -Math.PI / 2) graphRot += Math.PI;

  const a2Str = formatNum(a2, decimals);
  const b2Str = formatNum(b2, decimals);
  const aStr = formatNum(a, decimals);
  const bStr = formatNum(b, decimals);
  const hStr = formatNum(h, decimals);
  const kStr = formatNum(k, decimals);

  if (Math.abs(graphRot) < 0.0087) {
    const termX = formatSquaredTerm('x', h, decimals);
    const termY = formatSquaredTerm('y', k, decimals);

    return {
      type: 'ellipse_aligned',
      center: { x: h, y: k },
      radiusX: a,
      radiusY: b,
      rotation: 0,
      latex: `\\frac{${termX.latex}}{${a2Str}} + \\frac{${termY.latex}}{${b2Str}} = 1`,
      text: `${termX.text}/${a2Str} + ${termY.text}/${b2Str} = 1`,
      detailsLatex: `\\text{Center } (${hStr}, ${kStr}), \\; a = ${aStr}, \\; b = ${bStr}`,
      detailsText: `Center (${hStr}, ${kStr}), a = ${aStr}, b = ${bStr}`,
      fullPrecision: { h, k, a, b, a2, b2, rotation: 0 }
    };
  }

  const rotDeg = graphRot * 180 / Math.PI;
  const rotDegStr = formatNum(rotDeg, 1);
  const cosT = Math.cos(graphRot);
  const sinT = Math.sin(graphRot);
  const cosTStr = formatNum(cosT, 3);
  const sinTStr = formatNum(sinT, 3);

  const shiftedX = formatShiftedVar('x', h, decimals);
  const shiftedY = formatShiftedVar('y', k, decimals);

  let uDefLatex = `u = ${cosTStr}${shiftedX.latex}`;
  if (sinT >= 0) uDefLatex += ` + ${sinTStr}${shiftedY.latex}`;
  else uDefLatex += ` - ${formatNum(Math.abs(sinT), 3)}${shiftedY.latex}`;

  let vDefLatex = '';
  if (sinT >= 0) vDefLatex = `v = -${sinTStr}${shiftedX.latex} + ${cosTStr}${shiftedY.latex}`;
  else vDefLatex = `v = ${formatNum(Math.abs(sinT), 3)}${shiftedX.latex} + ${cosTStr}${shiftedY.latex}`;

  let uDefText = `u = ${cosTStr}${shiftedX.text}` + (sinT >= 0 ? ` + ${sinTStr}${shiftedY.text}` : ` - ${formatNum(Math.abs(sinT), 3)}${shiftedY.text}`);
  let vDefText = (sinT >= 0 ? `v = -${sinTStr}${shiftedX.text}` : `v = ${formatNum(Math.abs(sinT), 3)}${shiftedX.text}`) + ` + ${cosTStr}${shiftedY.text}`;

  return {
    type: 'ellipse_rotated',
    center: { x: h, y: k },
    radiusX: a,
    radiusY: b,
    rotation: graphRot,
    canvasRotation,
    latex: `\\frac{u^2}{${a2Str}} + \\frac{v^2}{${b2Str}} = 1`,
    text: `u²/${a2Str} + v²/${b2Str} = 1`,
    transformDefinitions: {
      uLatex: uDefLatex,
      vLatex: vDefLatex,
      uText: uDefText,
      vText: vDefText
    },
    detailsLatex: `\\text{Rotated } ${rotDegStr}^\\circ, \\; \\text{Center } (${hStr}, ${kStr}), \\; a = ${aStr}, \\; b = ${bStr}`,
    detailsText: `Rotated ${rotDegStr}°, Center (${hStr}, ${kStr}), a = ${aStr}, b = ${bStr}`,
    fullPrecision: { h, k, a, b, a2, b2, rotation: graphRot, cosT, sinT }
  };
}

function getShapeOrderedVertices(shape) {
  const { type, geometry } = shape;
  if (!geometry) return [];

  switch (type) {
    case 'triangle': {
      if (geometry.vertices && geometry.vertices.length >= 3) {
        return geometry.vertices.slice(0, 3);
      }
      return [];
    }

    case 'rectangle':
    case 'square': {
      const { center, width, height, rotation = 0 } = geometry;
      if (!center || width === undefined || height === undefined) return [];

      const theta = -rotation;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const hw = width / 2;
      const hh = height / 2;

      return [
        { x: center.x + hw * cosT - hh * sinT, y: center.y + hw * sinT + hh * cosT },
        { x: center.x - hw * cosT - hh * sinT, y: center.y - hw * sinT + hh * cosT },
        { x: center.x - hw * cosT + hh * sinT, y: center.y - hw * sinT - hh * cosT },
        { x: center.x + hw * cosT + hh * sinT, y: center.y + hw * sinT - hh * cosT }
      ];
    }

    case 'polygon': {
      const { center, radius, sides = 5, rotation = 0 } = geometry;
      if (!center || radius === undefined) return [];

      const theta = -rotation;
      const k = Math.max(3, Math.min(12, sides));
      const vertices = [];
      for (let i = 0; i < k; i++) {
        const a = theta + i * (Math.PI * 2 / k);
        vertices.push({
          x: center.x + radius * Math.cos(a),
          y: center.y + radius * Math.sin(a)
        });
      }
      return vertices;
    }

    case 'star': {
      const { center, outerRadius, innerRadius, rotation = 0 } = geometry;
      if (!center || outerRadius === undefined || innerRadius === undefined) return [];

      const theta = -rotation;
      const vertices = [];
      for (let i = 0; i < 10; i++) {
        const a = theta + i * (Math.PI / 5);
        const r = (i % 2 === 0) ? outerRadius : innerRadius;
        vertices.push({
          x: center.x + r * Math.cos(a),
          y: center.y + r * Math.sin(a)
        });
      }
      return vertices;
    }

    default:
      return [];
  }
}

function derivePolygonBoundaryEquations(shape, decimals = 2) {
  const vertices = getShapeOrderedVertices(shape);
  if (!vertices || vertices.length < 3) return null;

  const n = vertices.length;
  const edges = [];

  for (let i = 0; i < n; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % n];
    const edgeEq = deriveLineSegmentEquation(v1, v2, decimals);
    edges.push({
      edgeIndex: i + 1,
      v1,
      v2,
      ...edgeEq
    });
  }

  let shapeTitle = '';
  switch (shape.type) {
    case 'triangle': shapeTitle = 'Triangle'; break;
    case 'square': shapeTitle = 'Square'; break;
    case 'rectangle': shapeTitle = 'Rectangle'; break;
    case 'polygon': shapeTitle = `${shape.geometry.sides || n}-Sided Polygon`; break;
    case 'star': shapeTitle = '5-Point Star'; break;
    default: shapeTitle = capitalize(shape.type); break;
  }

  return {
    type: 'polygon_boundary',
    shapeType: shape.type,
    shapeTitle,
    edgeCount: n,
    vertices,
    edges,
    summaryLatex: `\\text{Boundary Equations (}${n}\\text{ piecewise edges)}`,
    summaryText: `Boundary Equations (${n} piecewise edges)`
  };
}

function formatFittedDomain(domain, indepVar = 'x', decimals = 2) {
  if (!domain || domain.length < 2) {
    return { latex: '', text: '' };
  }
  const uMinStr = formatNum(domain[0], decimals);
  const uMaxStr = formatNum(domain[1], decimals);
  return {
    latex: `\\quad \\left\\{ ${uMinStr} \\le ${indepVar} \\le ${uMaxStr} \\right\\}`,
    text: `  {${uMinStr} <= ${indepVar} <= ${uMaxStr}}`
  };
}

function formatLinearFittedEquation(m, b, domain, orientation = 'y_of_x', decimals = 2) {
  const depVar = orientation === 'y_of_x' ? 'y' : 'x';
  const indepVar = orientation === 'y_of_x' ? 'x' : 'y';
  const dom = formatFittedDomain(domain, indepVar, decimals);

  let exprLatex = '';
  let exprText = '';

  if (Math.abs(m) < 1e-4) {
    const bStr = formatNum(b, decimals);
    exprLatex = bStr;
    exprText = bStr;
  } else {
    let mStr = '';
    if (Math.abs(m - 1.0) < 1e-4) {
      mStr = indepVar;
    } else if (Math.abs(m - (-1.0)) < 1e-4) {
      mStr = `-${indepVar}`;
    } else {
      mStr = `${formatNum(m, decimals)}${indepVar}`;
    }

    const bVal = formatNum(Math.abs(b), decimals);
    let bStr = '';
    if (bVal !== '0') {
      bStr = b > 0 ? ` + ${bVal}` : ` - ${bVal}`;
    }

    exprLatex = `${mStr}${bStr}`;
    exprText = `${mStr}${bStr}`;
  }

  return {
    latex: `${depVar} = ${exprLatex}${dom.latex}`,
    text: `${depVar} = ${exprText}${dom.text}`,
    latexWithoutDomain: `${depVar} = ${exprLatex}`,
    textWithoutDomain: `${depVar} = ${exprText}`
  };
}

function formatQuadraticFittedEquation(a, b, c, domain, orientation = 'y_of_x', decimals = 2) {
  const depVar = orientation === 'y_of_x' ? 'y' : 'x';
  const indepVar = orientation === 'y_of_x' ? 'x' : 'y';
  const dom = formatFittedDomain(domain, indepVar, decimals);

  const termsLatex = [];
  const termsText = [];

  const aVal = formatNum(a, decimals);
  if (aVal !== '0') {
    if (Math.abs(a - 1.0) < 1e-4) {
      termsLatex.push(`${indepVar}^2`);
      termsText.push(`${indepVar}²`);
    } else if (Math.abs(a - (-1.0)) < 1e-4) {
      termsLatex.push(`-${indepVar}^2`);
      termsText.push(`-${indepVar}²`);
    } else {
      termsLatex.push(`${aVal}${indepVar}^2`);
      termsText.push(`${aVal}${indepVar}²`);
    }
  }

  const bVal = formatNum(Math.abs(b), decimals);
  if (bVal !== '0') {
    const prefix = (termsLatex.length > 0 && b > 0) ? ' + ' : ((termsLatex.length > 0 && b < 0) ? ' - ' : (b < 0 ? '-' : ''));
    if (Math.abs(Math.abs(b) - 1.0) < 1e-4) {
      termsLatex.push(`${prefix}${indepVar}`);
      termsText.push(`${prefix}${indepVar}`);
    } else {
      termsLatex.push(`${prefix}${bVal}${indepVar}`);
      termsText.push(`${prefix}${bVal}${indepVar}`);
    }
  }

  const cVal = formatNum(Math.abs(c), decimals);
  if (cVal !== '0' || termsLatex.length === 0) {
    const prefix = (termsLatex.length > 0 && c > 0) ? ' + ' : ((termsLatex.length > 0 && c < 0) ? ' - ' : (c < 0 ? '-' : ''));
    termsLatex.push(`${prefix}${cVal}`);
    termsText.push(`${prefix}${cVal}`);
  }

  const exprLatex = termsLatex.join('') || '0';
  const exprText = termsText.join('') || '0';

  return {
    latex: `${depVar} = ${exprLatex}${dom.latex}`,
    text: `${depVar} = ${exprText}${dom.text}`,
    latexWithoutDomain: `${depVar} = ${exprLatex}`,
    textWithoutDomain: `${depVar} = ${exprText}`
  };
}

function formatCubicFittedEquation(a, b, c, d, domain, orientation = 'y_of_x', decimals = 2) {
  const depVar = orientation === 'y_of_x' ? 'y' : 'x';
  const indepVar = orientation === 'y_of_x' ? 'x' : 'y';
  const dom = formatFittedDomain(domain, indepVar, decimals);

  const termsLatex = [];
  const termsText = [];

  const aVal = formatNum(a, decimals);
  if (aVal !== '0') {
    if (Math.abs(a - 1.0) < 1e-4) {
      termsLatex.push(`${indepVar}^3`);
      termsText.push(`${indepVar}³`);
    } else if (Math.abs(a - (-1.0)) < 1e-4) {
      termsLatex.push(`-${indepVar}^3`);
      termsText.push(`-${indepVar}³`);
    } else {
      termsLatex.push(`${aVal}${indepVar}^3`);
      termsText.push(`${aVal}${indepVar}³`);
    }
  }

  const bVal = formatNum(Math.abs(b), decimals);
  if (bVal !== '0') {
    const prefix = (termsLatex.length > 0 && b > 0) ? ' + ' : ((termsLatex.length > 0 && b < 0) ? ' - ' : (b < 0 ? '-' : ''));
    if (Math.abs(Math.abs(b) - 1.0) < 1e-4) {
      termsLatex.push(`${prefix}${indepVar}^2`);
      termsText.push(`${prefix}${indepVar}²`);
    } else {
      termsLatex.push(`${prefix}${bVal}${indepVar}^2`);
      termsText.push(`${prefix}${bVal}${indepVar}²`);
    }
  }

  const cVal = formatNum(Math.abs(c), decimals);
  if (cVal !== '0') {
    const prefix = (termsLatex.length > 0 && c > 0) ? ' + ' : ((termsLatex.length > 0 && c < 0) ? ' - ' : (c < 0 ? '-' : ''));
    if (Math.abs(Math.abs(c) - 1.0) < 1e-4) {
      termsLatex.push(`${prefix}${indepVar}`);
      termsText.push(`${prefix}${indepVar}`);
    } else {
      termsLatex.push(`${prefix}${cVal}${indepVar}`);
      termsText.push(`${prefix}${cVal}${indepVar}`);
    }
  }

  const dVal = formatNum(Math.abs(d), decimals);
  if (dVal !== '0' || termsLatex.length === 0) {
    const prefix = (termsLatex.length > 0 && d > 0) ? ' + ' : ((termsLatex.length > 0 && d < 0) ? ' - ' : (d < 0 ? '-' : ''));
    termsLatex.push(`${prefix}${dVal}`);
    termsText.push(`${prefix}${dVal}`);
  }

  const exprLatex = termsLatex.join('') || '0';
  const exprText = termsText.join('') || '0';

  return {
    latex: `${depVar} = ${exprLatex}${dom.latex}`,
    text: `${depVar} = ${exprText}${dom.text}`,
    latexWithoutDomain: `${depVar} = ${exprLatex}`,
    textWithoutDomain: `${depVar} = ${exprText}`
  };
}

function formatAbsFittedEquation(a, h, k, domain, orientation = 'y_of_x', decimals = 2) {
  const depVar = orientation === 'y_of_x' ? 'y' : 'x';
  const indepVar = orientation === 'y_of_x' ? 'x' : 'y';
  const dom = formatFittedDomain(domain, indepVar, decimals);

  let aStr = '';
  if (Math.abs(a - 1.0) < 1e-4) {
    aStr = '';
  } else if (Math.abs(a - (-1.0)) < 1e-4) {
    aStr = '-';
  } else {
    aStr = formatNum(a, decimals);
  }

  const hVal = formatNum(Math.abs(h), decimals);
  let inner = indepVar;
  if (hVal !== '0') {
    inner = h > 0 ? `${indepVar} - ${hVal}` : `${indepVar} + ${hVal}`;
  }

  const kVal = formatNum(Math.abs(k), decimals);
  let kStr = '';
  if (kVal !== '0') {
    kStr = k > 0 ? ` + ${kVal}` : ` - ${kVal}`;
  }

  const latex = `${depVar} = ${aStr}\\left|${inner}\\right|${kStr}${dom.latex}`;
  const text = `${depVar} = ${aStr}|${inner}|${kStr}${dom.text}`;

  return {
    latex,
    text,
    latexWithoutDomain: `${depVar} = ${aStr}\\left|${inner}\\right|${kStr}`,
    textWithoutDomain: `${depVar} = ${aStr}|${inner}|${kStr}`
  };
}

function formatSineFittedEquation(A, B, C, D, domain, orientation = 'y_of_x', decimals = 2) {
  const depVar = orientation === 'y_of_x' ? 'y' : 'x';
  const indepVar = orientation === 'y_of_x' ? 'x' : 'y';
  const dom = formatFittedDomain(domain, indepVar, decimals);

  let amp = A;
  let phase = C;
  if (amp < 0) {
    amp = -amp;
    phase = phase + Math.PI;
  }

  phase = (phase + Math.PI) % (2.0 * Math.PI) - Math.PI;
  if (Math.abs(phase + Math.PI) < 1e-4) {
    phase = Math.PI;
  }

  let aStr = '';
  if (Math.abs(amp - 1.0) >= 1e-4) {
    aStr = formatNum(amp, decimals);
  }

  let bStr = indepVar;
  if (Math.abs(B - 1.0) >= 1e-4) {
    bStr = `${formatNum(B, decimals)}${indepVar}`;
  }

  const cVal = formatNum(Math.abs(phase), decimals);
  let inner = bStr;
  if (cVal !== '0') {
    inner = phase > 0 ? `${bStr} + ${cVal}` : `${bStr} - ${cVal}`;
  }

  const dVal = formatNum(Math.abs(D), decimals);
  let dStr = '';
  if (dVal !== '0') {
    dStr = D > 0 ? ` + ${dVal}` : ` - ${dVal}`;
  }

  const aText = aStr ? `${aStr} ` : '';
  const latex = `${depVar} = ${aStr}\\sin\\left(${inner}\\right)${dStr}${dom.latex}`;
  const text = `${depVar} = ${aText}sin(${inner})${dStr}${dom.text}`;

  return {
    latex,
    text,
    latexWithoutDomain: `${depVar} = ${aStr}\\sin\\left(${inner}\\right)${dStr}`,
    textWithoutDomain: `${depVar} = ${aText}sin(${inner})${dStr}`
  };
}

function formatFittedEquation(family, params, domain, orientation = 'y_of_x', decimals = 2) {
  const fam = (family || 'linear').toLowerCase().replace(/\s+/g, '_');
  switch (fam) {
    case 'linear':
      return formatLinearFittedEquation(params.m ?? 1, params.b ?? 0, domain, orientation, decimals);
    case 'quadratic':
      return formatQuadraticFittedEquation(params.a ?? 1, params.b ?? 0, params.c ?? 0, domain, orientation, decimals);
    case 'cubic':
      return formatCubicFittedEquation(params.a ?? 1, params.b ?? 0, params.c ?? 0, params.d ?? 0, domain, orientation, decimals);
    case 'absolute_value':
      return formatAbsFittedEquation(params.a ?? 1, params.h ?? 0, params.k ?? 0, domain, orientation, decimals);
    case 'sine':
      return formatSineFittedEquation(params.A ?? 1, params.B ?? 1, params.C ?? 0, params.D ?? 0, domain, orientation, decimals);
    default:
      return formatLinearFittedEquation(params.m ?? 1, params.b ?? 0, domain, orientation, decimals);
  }
}

function deriveShapeEquations(shape, decimals = 2) {
  if (!shape || !shape.geometry) return null;

  const { type, geometry } = shape;
  const customTitle = shape.label;

  switch (type) {
    case 'line': {
      const lineEq = deriveLineSegmentEquation(geometry.p1, geometry.p2, decimals);
      return {
        shapeId: shape.id,
        shapeType: 'line',
        title: customTitle || `Line ${shape.id || ''}`,
        primaryEquation: lineEq.latex,
        primaryText: lineEq.text,
        equationData: lineEq
      };
    }

    case 'circle': {
      const circleEq = deriveCircleEquation(geometry.center, geometry.radius, decimals);
      return {
        shapeId: shape.id,
        shapeType: 'circle',
        title: customTitle || `Circle ${shape.id || ''}`,
        primaryEquation: circleEq.latex,
        primaryText: circleEq.text,
        detailsLatex: circleEq.detailsLatex,
        detailsText: circleEq.detailsText,
        equationData: circleEq
      };
    }

    case 'ellipse': {
      const ellipseEq = deriveEllipseEquation(
        geometry.center,
        geometry.radiusX,
        geometry.radiusY,
        geometry.rotation || 0,
        decimals
      );
      return {
        shapeId: shape.id,
        shapeType: 'ellipse',
        title: customTitle || `Ellipse ${shape.id || ''}`,
        primaryEquation: ellipseEq.latex,
        primaryText: ellipseEq.text,
        transformDefinitions: ellipseEq.transformDefinitions,
        detailsLatex: ellipseEq.detailsLatex,
        detailsText: ellipseEq.detailsText,
        equationData: ellipseEq
      };
    }

    case 'triangle':
    case 'rectangle':
    case 'square':
    case 'polygon':
    case 'star': {
      const boundaryEq = derivePolygonBoundaryEquations(shape, decimals);
      return {
        shapeId: shape.id,
        shapeType: shape.type,
        title: customTitle || `${boundaryEq.shapeTitle} ${shape.id || ''}`,
        isMultiEdge: true,
        edgeCount: boundaryEq.edgeCount,
        edges: boundaryEq.edges,
        summaryLatex: boundaryEq.summaryLatex,
        summaryText: boundaryEq.summaryText,
        equationData: boundaryEq
      };
    }

    case 'freehand':
    default: {
      const isFitted = shape.fitData && shape.fitData.success && shape.fitData.candidates && shape.fitData.candidates.length > 0;
      if (isFitted) {
        const candidateIndex = (shape.selectedCandidateIndex >= 0 && shape.selectedCandidateIndex < shape.fitData.candidates.length)
          ? shape.selectedCandidateIndex
          : 0;
        const cand = shape.fitData.candidates[candidateIndex];
        const isSideways = (cand.orientation === 'x_of_y');
        const orientLabel = isSideways ? 'x = g(y)' : 'y = f(x)';
        const isManual = !!cand.is_manually_adjusted;
        return {
          shapeId: shape.id,
          shapeType: 'freehand',
          title: customTitle || `Fitted Curve ${shape.id || ''}`,
          isFreehand: true,
          isFitted: true,
          isApprox: true,
          isManuallyAdjusted: isManual,
          candidateIndex,
          candidate: cand,
          candidates: shape.fitData.candidates,
          orientation: cand.orientation || 'y_of_x',
          isSideways: isSideways,
          primaryEquation: cand.latex || cand.latex_with_domain || '',
          primaryText: cand.text || cand.text_with_domain || '',
          latexWithoutDomain: cand.latex_without_domain || cand.latex || '',
          textWithoutDomain: cand.text_without_domain || cand.text || '',
          domain: cand.domain,
          rmse: cand.rmse,
          geomError: cand.geom_error ?? cand.rmse,
          rSquared: cand.r_squared ?? 0,
          isPoorFit: !!cand.is_poor_fit,
          warning: cand.warning || null,
          score: cand.score,
          parameters: cand.params || cand.parameters || {},
          plottingSamples: cand.plot_points || cand.plotting_samples || [],
          familyName: cand.family_name,
          detailsLatex: `\\text{Family: } ${cand.family_name} \\; (${orientLabel}) \\quad | \\quad \\text{Error: } ${(cand.geom_error ?? cand.rmse).toFixed(3)}${isManual ? ' \\; [\\text{Adjusted}]' : ''}`
        };
      }
      return {
        shapeId: shape.id,
        shapeType: 'freehand',
        title: customTitle || `Freehand Stroke ${shape.id || ''}`,
        isFreehand: true,
        isFitted: false,
        note: 'Freehand stroke. Click "Fit Equation" to approximate with mathematical models (Linear, Quadratic, Cubic, Absolute Value, Sine).'
      };
    }
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatNum,
    formatShiftedVar,
    formatSquaredTerm,
    deriveLineSegmentEquation,
    deriveCircleEquation,
    deriveEllipseEquation,
    getShapeOrderedVertices,
    derivePolygonBoundaryEquations,
    deriveShapeEquations,
    formatFittedDomain,
    formatLinearFittedEquation,
    formatQuadraticFittedEquation,
    formatCubicFittedEquation,
    formatAbsFittedEquation,
    formatSineFittedEquation,
    formatFittedEquation
  };
}
