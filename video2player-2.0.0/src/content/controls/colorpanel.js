import { el } from '../shell.js';

const asPercent = (value) => `${Math.round(value * 100)}%`;

const asWarmth = (value) =>
  value === 0 ? 'off' : `${Math.round((value / 0.45) * 100)}%`;

// Steppers rather than sliders: a thumb can hit a 44px button while holding the
// phone, which is not true of a slider handle.
const ROWS = [
  // A wider reach and a bigger step than the rest: brightness is the one people
  // come here for, on a dark film in a dark room, and at 5% a press with a
  // ceiling of 150% it took ten presses to do anything you would call
  // brightening — which reads as a control that does not work.
  {
    key: 'brightness',
    label: 'Brightness',
    min: 0.4,
    max: 2,
    step: 0.1,
    value: 1,
    format: asPercent,
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    value: 1,
    format: asPercent,
  },
  {
    key: 'saturate',
    label: 'Saturation',
    min: 0,
    max: 2,
    step: 0.1,
    value: 1,
    format: asPercent,
  },
  {
    key: 'warmth',
    label: 'Night light',
    min: 0,
    max: 0.45,
    step: 0.09,
    value: 0,
    format: asWarmth,
  },
];

const round = (value, step) => Math.round(value / step) * step;

const buildStepper = (spec, onChange) => {
  const readout = el('span', {
    class: 'step-value',
    text: spec.format(spec.value),
  });
  const minus = el('button', {
    class: 'step-button',
    type: 'button',
    text: '−',
    'aria-label': `Less ${spec.label.toLowerCase()}`,
  });
  const plus = el('button', {
    class: 'step-button',
    type: 'button',
    text: '+',
    'aria-label': `More ${spec.label.toLowerCase()}`,
  });

  let value = spec.value;

  const set = (next) => {
    value = round(Math.min(spec.max, Math.max(spec.min, next)), spec.step);
    readout.textContent = spec.format(value);
    minus.disabled = value <= spec.min;
    plus.disabled = value >= spec.max;
    return value;
  };

  minus.addEventListener('click', () =>
    onChange(spec.key, set(value - spec.step)),
  );
  plus.addEventListener('click', () =>
    onChange(spec.key, set(value + spec.step)),
  );
  set(spec.value);

  return {
    key: spec.key,
    reset: () => set(spec.value),
    set,
    root: el('div', { class: 'step-row' }, [
      el('span', { class: 'step-label', text: spec.label }),
      minus,
      readout,
      plus,
    ]),
  };
};

export const createColorPanel = (onChange) => {
  const steppers = ROWS.map((spec) => buildStepper(spec, onChange));
  const byKey = new Map(steppers.map((stepper) => [stepper.key, stepper]));

  const reset = el('button', {
    class: 'step-reset',
    type: 'button',
    text: 'Reset',
  });

  reset.addEventListener('click', () => {
    for (const stepper of steppers) onChange(stepper.key, stepper.reset());
  });

  const root = el('div', { class: 'panel' }, [
    ...steppers.map((stepper) => stepper.root),
    reset,
  ]);

  return {
    root,
    toggle: () => root.classList.toggle('is-open'),
    close: () => root.classList.remove('is-open'),
    isOpen: () => root.classList.contains('is-open'),
    setValue: (key, value) => byKey.get(key)?.set(value),
  };
};
