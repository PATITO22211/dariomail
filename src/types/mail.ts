export type FolderId = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';

export type ThemeMode = 'dark' | 'light';

export interface Participant {
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

export interface MailMessage {
  id: string;
  sender: Participant;
  recipients: string[];
  timestamp: string; // ISO string
  bodyHtml: string;
  plainSnippet: string;
  isHtmlRich?: boolean;
  unread?: boolean;
  messageIdHeader?: string;
  references?: string[];
  remoteImagesBlocked?: boolean;
  attachments?: Array<{
    name: string;
    size: string;
    kind: 'pdf' | 'image' | 'doc';
    blobId?: string;
  }>;
}

export interface MailThread {
  id: string;
  folder: FolderId;
  subject: string;
  unread: boolean;
  starred?: boolean;
  category?: 'correspondence' | 'newsletter' | 'invoice' | 'personal';
  updatedAt: string; // ISO string
  rawSubject?: string;
  messageIds?: string[];
  messages: MailMessage[];
  draftTo?: string;
  draftBodyHtml?: string;
}

export interface ComposeAttachment {
  id: string;
  name: string;
  sizeLabel: string;
  contentType: string;
  dataBase64?: string;
  blobId?: string;
  size?: number;
}

export interface ComposePayload {
  draftThreadId?: string;
  to: string;
  subject: string;
  bodyHtml: string;
  attachments?: ComposeAttachment[];
}

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: 'Navegación' | 'Acciones' | 'Búsqueda' | 'Hilos';
  keywords: string[];
  shortcut?: string;
  run: () => void;
}
