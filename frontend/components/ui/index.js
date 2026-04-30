/**
 * UI Primitive Components — AhoyVPN Frontend
 *
 * Barrel export for all reusable UI primitives. Components are organized by
 * abstraction level:
 *
 *   Layout:   Card
 *   Actions:  Button
 *   Feedback: Alert, Modal, Spinner
 *   Forms:    Form, FormGroup, Input, Select
 *
 * Why a barrel?
 *   - Single import path per consumer: `import { Button, Card } from '../components/ui'`
 *   - Adding a new component only requires updating this file
 *   - Refactoring internal component paths only affects this file
 *
 * Named exports (non-default) are also available directly:
 *   import { FormGroup, Input, Select } from '../components/ui'
 *
 * Excluded from barrel (used only within specific page contexts):
 *   - SkeletonText, SkeletonCard (used in loading states, exported from Spinner.jsx)
 */

// Layout primitives
export { default as Card } from './Card';
export { default as Button } from './Button';

// Feedback / overlay
export { default as Alert } from './Alert';
export { default as Modal } from './Modal';
export { default as Spinner } from './Spinner';

// Form primitives (Form default export, plus named form controls)
export { default as Form } from './Form';
export { FormGroup, Input, Select, Textarea } from './Form';
