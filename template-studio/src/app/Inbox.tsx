import type { ComponentChildren } from 'preact';

import {
  MailArchive,
  MailBack,
  MailCaret,
  MailClock,
  MailCompose,
  MailDraft,
  MailInbox,
  MailMore,
  MailReply,
  MailSend,
  MailStar,
  MailTrash,
} from './icons.tsx';

// The client around the message.
//
// Not decoration, and not a joke about skeuomorphism: an email is never read on a white page, and
// "what does this look like where it lands" is a question the canvas alone cannot answer. Two
// things in here are true rather than dressing, and they are the reason it exists:
//
//   - **The gutter.** Every client insets the message, the email cannot remove it, and what shows
//     in it is the page background. On a desktop that inset is small; in a phone app it is not.
//     Before this there was nowhere in the app you could see either.
//   - **The fold.** The message viewport is a fixed height, so the thing you see is the thing that
//     arrives — which is the only honest way to ask whether the top of the email does its job.
//
// The rest — the toolbar, the star, the reply arrow — is inert, and is here because the *shape* is
// what makes the view read as an inbox at a glance rather than as a box with a name in it. There is
// no logo and no wordmark: this imitates a layout, which is what a preview is for, and imitating a
// brand is a different thing that this has no reason to do.

export interface InboxChromeProps {
  /** The subject line. In HubSpot that is `{{ subject }}` and belongs to the send, so this is the
   *  template's name — the same stand-in the preview's `<title>` uses. */
  subject: string;
  device: 'desktop' | 'phone';
  /** The message itself. Passed in rather than rendered here, because on a desktop it has to sit
   *  *beside* the folder list, and the chrome is the thing that knows that. */
  children: ComponentChildren;
}

const SENDER = 'Switchyards';
const ADDRESS = 'hello@switchyards.com';
/** A fixed time, not `new Date()`. A clock that moves on every render is noise in a design tool. */
const WHEN = '9:41 AM';

/** The folder list. Inert, and there for its silhouette. */
const FOLDERS: Array<{ name: string; icon: typeof MailInbox; count?: string }> = [
  { name: 'Inbox', icon: MailInbox, count: '12' },
  { name: 'Starred', icon: MailStar },
  { name: 'Snoozed', icon: MailClock },
  { name: 'Sent', icon: MailSend },
  { name: 'Drafts', icon: MailDraft, count: '3' },
];

export function InboxChrome({ subject, device, children }: InboxChromeProps) {
  // The phone keeps the compact header: a toolbar and a label chip on a 375px screen is chrome
  // eating the thing it is framing, and the phone's useful truth is the gutter, which it has.
  if (device === 'phone') {
    return (
      <>
        <div class="mail-head" aria-hidden="true">
          <p class="mail-subject">{subject}</p>
          <div class="mail-row">
            <span class="mail-avatar">{SENDER[0]}</span>
            <span class="mail-who">
              <b>{SENDER}</b>
              <span class="mail-addr">{ADDRESS}</span>
            </span>
            <span class="mail-when">{WHEN}</span>
          </div>
        </div>
        {children}
      </>
    );
  }

  return (
    <div class="gmail" aria-hidden="true">
      {/* The folder list. It holds no information and never will — what it contributes is width:
          a message on a desktop is not the width of the window, it is the window minus this, and
          an email that only looks right at 900px is an email nobody has seen yet. */}
      <nav class="gmail-nav">
        <span class="gmail-compose">
          <MailCompose />
          Compose
        </span>
        <ul class="gmail-folders">
          {FOLDERS.map(({ name, icon: Icon, count }) => (
            <li key={name} class={name === 'Inbox' ? 'on' : ''}>
              <Icon />
              <span class="gmail-folder-name">{name}</span>
              {count && <span class="gmail-folder-count">{count}</span>}
            </li>
          ))}
        </ul>
      </nav>

      <div class="gmail-main">
      {/* The toolbar. Grouped the way an open message groups them — move-it-somewhere, then
          do-something-later, then the overflow — because the gaps are half of what the eye
          recognises. */}
      <div class="gmail-tools">
        <span class="gmail-tool">
          <MailBack />
        </span>
        <span class="gmail-rule" />
        <span class="gmail-tool">
          <MailArchive />
        </span>
        <span class="gmail-tool">
          <MailTrash />
        </span>
        <span class="gmail-rule" />
        <span class="gmail-tool">
          <MailMore />
        </span>
      </div>

      <div class="gmail-subject">
        <span class="gmail-subject-text">{subject}</span>
        <span class="gmail-chip">Inbox</span>
      </div>

      <div class="gmail-from">
        <span class="gmail-avatar">{SENDER[0]}</span>
        <div class="gmail-who">
          <div class="gmail-line">
            <b>{SENDER}</b>
            <span class="gmail-addr">&lt;{ADDRESS}&gt;</span>
          </div>
          <div class="gmail-to">
            to me
            <MailCaret />
          </div>
        </div>
        <span class="gmail-when">{WHEN}</span>
        <span class="gmail-tool">
          <MailStar />
        </span>
        <span class="gmail-tool">
          <MailReply />
        </span>
      </div>

      {children}
      </div>
    </div>
  );
}
