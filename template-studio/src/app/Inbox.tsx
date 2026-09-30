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
//
// One control is live: Back. It goes to the list, which is where the third true thing is — **the
// preview text**, the grey line after the subject (learnings 1.17), cut off where the client cuts
// it off. The row is the only real one; its neighbours are bars, because invented senders and
// subjects would be copy somebody could mistake for a suggestion. The message stays mounted under
// the list, so going back and opening it again costs the canvas nothing.

export interface InboxChromeProps {
  /** The subject line. In HubSpot that is `{{ subject }}` and belongs to the send, so this is the
   *  template's name — the same stand-in the preview's `<title>` uses. */
  subject: string;
  /** The grey line after the subject in the list: the preview text, or the email's own first words
   *  when there is none, which is what a client falls back to. */
  snippet: string;
  /** Showing the list rather than the open message. */
  list: boolean;
  onList(list: boolean): void;
  device: 'desktop' | 'phone';
  /** The message itself. Passed in rather than rendered here, because on a desktop it has to sit
   *  *beside* the folder list, and the chrome is the thing that knows that. */
  children: ComponentChildren;
}

const SENDER = 'Switchyards';
const ADDRESS = 'hello@switchyards.com';
/** A fixed time, not `new Date()`. A clock that moves on every render is noise in a design tool. */
const WHEN = '9:41 AM';

/** The neighbours in the list, as bar widths: sender, then subject and snippet. Fixed, not random —
 *  the same reason the clock does not move. */
const NEIGHBOURS: Array<[number, number]> = [
  [52, 78],
  [64, 58],
  [44, 70],
  [58, 84],
  [48, 64],
  [60, 74],
];

const BACK_TITLE = 'Back to the inbox — the row this email arrives as: the sender, the subject, and the preview text after it, cut off where the client cuts it off.';

/** The folder list. Inert, and there for its silhouette. */
const FOLDERS: Array<{ name: string; icon: typeof MailInbox; count?: string }> = [
  { name: 'Inbox', icon: MailInbox, count: '12' },
  { name: 'Starred', icon: MailStar },
  { name: 'Snoozed', icon: MailClock },
  { name: 'Sent', icon: MailSend },
  { name: 'Drafts', icon: MailDraft, count: '3' },
];

export function InboxChrome({ subject, snippet, list, onList, device, children }: InboxChromeProps) {
  // The phone keeps the compact header: a toolbar and a label chip on a 375px screen is chrome
  // eating the thing it is framing, and the phone's useful truth is the gutter, which it has.
  if (device === 'phone') {
    return (
      <div class="mail-phone">
        {list && <PhoneList subject={subject} snippet={snippet} onOpen={() => onList(false)} />}
        <div class="mail-head">
          <button class="mail-back" title={BACK_TITLE} onClick={() => onList(true)}>
            <MailBack />
            Inbox
          </button>
          <div aria-hidden="true">
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
        </div>
        {children}
      </div>
    );
  }

  return (
    <div class="gmail">
      {/* The folder list. It holds no information and never will — what it contributes is width:
          a message on a desktop is not the width of the window, it is the window minus this, and
          an email that only looks right at 900px is an email nobody has seen yet. */}
      <nav class="gmail-nav" aria-hidden="true">
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
      {list && <DesktopList subject={subject} snippet={snippet} onOpen={() => onList(false)} />}
      {/* The toolbar. Grouped the way an open message groups them — move-it-somewhere, then
          do-something-later, then the overflow — because the gaps are half of what the eye
          recognises. */}
      <div class="gmail-tools">
        <button class="gmail-tool live" aria-label="Back to the inbox" title={BACK_TITLE} onClick={() => onList(true)}>
          <MailBack />
        </button>
        <span class="gmail-rule" aria-hidden="true" />
        <span class="gmail-tool" aria-hidden="true">
          <MailArchive />
        </span>
        <span class="gmail-tool" aria-hidden="true">
          <MailTrash />
        </span>
        <span class="gmail-rule" aria-hidden="true" />
        <span class="gmail-tool" aria-hidden="true">
          <MailMore />
        </span>
      </div>

      <div class="gmail-subject" aria-hidden="true">
        <span class="gmail-subject-text">{subject}</span>
        <span class="gmail-chip">Inbox</span>
      </div>

      <div class="gmail-from" aria-hidden="true">
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

/**
 * A desktop inbox: one line a message, the subject and then the snippet after a dash, both cut off at
 * the right-hand edge. How much of the preview text survives depends on how long the subject is and
 * how wide the window is, and this is drawn at the width the message pane has here.
 */
function DesktopList({ subject, snippet, onOpen }: { subject: string; snippet: string; onOpen(): void }) {
  return (
    <div class="gmail-list">
      <div class="gmail-tools" aria-hidden="true">
        <span class="gmail-check" />
        <span class="gmail-tool">
          <MailCaret />
        </span>
        <span class="gmail-tool">
          <MailMore />
        </span>
        <span class="gmail-count">1–50 of 1,204</span>
      </div>
      <ul class="gmail-rows">
        <li>
          <button class="gmail-row unread" title="Open it" onClick={onOpen}>
            <span class="gmail-check" aria-hidden="true" />
            <span class="gmail-row-star" aria-hidden="true">
              <MailStar />
            </span>
            <span class="gmail-row-from">{SENDER}</span>
            <span class="gmail-row-text">
              <b>{subject}</b>
              {snippet && <span class="gmail-row-snippet"> - {snippet}</span>}
            </span>
            <span class="gmail-row-when">{WHEN}</span>
          </button>
        </li>
        {NEIGHBOURS.map(([from, text], i) => (
          <li key={i} class="gmail-row ghost" aria-hidden="true">
            <span class="gmail-check" />
            <span class="gmail-row-star">
              <MailStar />
            </span>
            <span class="gmail-row-from">
              <i style={{ width: `${from}%` }} />
            </span>
            <span class="gmail-row-text">
              <i style={{ width: `${text}%` }} />
            </span>
            <span class="gmail-row-when">
              <i />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A phone inbox, the way Mail on an iPhone draws one: the sender and the time, the subject, and two
 * lines of preview under it. Those two lines are the budget, and at 375px they hold about ninety
 * characters — Gmail's app gives one.
 */
function PhoneList({ subject, snippet, onOpen }: { subject: string; snippet: string; onOpen(): void }) {
  return (
    <div class="phone-list">
      <div class="phone-list-head" aria-hidden="true">
        <span>Mailboxes</span>
        <b>Inbox</b>
      </div>
      <ul class="phone-rows">
        <li>
          <button class="phone-row unread" title="Open it" onClick={onOpen}>
            <span class="phone-dot" aria-hidden="true" />
            <span class="phone-row-body">
              <span class="phone-row-top">
                <b>{SENDER}</b>
                <span class="phone-row-when">{WHEN}</span>
              </span>
              <span class="phone-row-subject">{subject}</span>
              <span class="phone-row-snippet">{snippet}</span>
            </span>
          </button>
        </li>
        {NEIGHBOURS.slice(0, 4).map(([from, text], i) => (
          <li key={i} class="phone-row ghost" aria-hidden="true">
            <span class="phone-dot" />
            <span class="phone-row-body">
              <span class="phone-row-top">
                <i style={{ width: `${from}%` }} />
              </span>
              <i style={{ width: `${text}%` }} />
              <i style={{ width: `${text + 12}%` }} />
              <i style={{ width: `${text - 16}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
