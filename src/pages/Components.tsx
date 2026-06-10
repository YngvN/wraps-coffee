import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  LanguageSwitcher,
  Modal,
  Spinner,
  ThemeToggle,
  TranslatedText,
} from '../components'
import './Components.scss'

export function Components() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="components-page">
      <h1>Components</h1>
      <p>A preview of the reusable UI components available in this template.</p>

      <section>
        <h2>Theme Toggle</h2>
        <div className="components-page__row">
          <ThemeToggle />
        </div>
      </section>

      <section>
        <h2>Language Switcher</h2>
        <div className="components-page__row">
          <LanguageSwitcher />
        </div>
      </section>

      <section>
        <h2>Translated Text</h2>
        <p>Switch languages above to see this fade in with the new text.</p>
        <div className="components-page__row">
          <TranslatedText as="p" id="home.welcome" />
        </div>
      </section>

      <section>
        <h2>Button</h2>
        <div className="components-page__row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section>
        <h2>Input</h2>
        <div className="components-page__row">
          <Input label="Email" placeholder="you@example.com" />
          <Input label="Password" type="password" error="Password is required" />
        </div>
      </section>

      <section>
        <h2>Checkbox</h2>
        <div className="components-page__row">
          <Checkbox label="Accept terms" />
          <Checkbox label="Disabled option" disabled />
        </div>
      </section>

      <section>
        <h2>Badge</h2>
        <div className="components-page__row">
          <Badge>Neutral</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="error">Error</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </section>

      <section>
        <h2>Alert</h2>
        <div className="components-page__column">
          <Alert variant="info" title="Info">
            This is an informational message.
          </Alert>
          <Alert variant="success" title="Success">
            Your changes have been saved.
          </Alert>
          <Alert variant="warning" title="Warning">
            Please double-check this action.
          </Alert>
          <Alert variant="error" title="Error">
            Something went wrong.
          </Alert>
        </div>
      </section>

      <section>
        <h2>Spinner</h2>
        <div className="components-page__row">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </section>

      <section>
        <h2>Card</h2>
        <div className="components-page__row">
          <Card title="Card title">
            <p>This is some card content.</p>
          </Card>
        </div>
      </section>

      <section>
        <h2>Modal</h2>
        <div className="components-page__row">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        </div>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Example modal">
          <p>This is the modal content.</p>
        </Modal>
      </section>
    </div>
  )
}
