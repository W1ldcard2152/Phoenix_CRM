import React from 'react';
import PropTypes from 'prop-types';

/**
 * A reusable wrapper component for a single step in a wizard.
 * It provides a consistent layout and styling for each step.
 *
 * @param {{
 *   title: string,
 *   children: React.ReactNode,
 *   isActive: boolean
 * }} props
 */
const WizardStep = ({ title, children, isActive }) => {
  if (!isActive) {
    return null;
  }

  return (
    <div className="wizard-step">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      {children}
    </div>
  );
};

WizardStep.propTypes = {
  /** The title of the wizard step, displayed as a heading. */
  title: PropTypes.string.isRequired,
  /** The content of the wizard step. */
  children: PropTypes.node.isRequired,
  /** Whether the step is currently active and visible. */
  isActive: PropTypes.bool.isRequired,
};

export default WizardStep;
