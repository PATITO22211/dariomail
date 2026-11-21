mod build;
mod client;
mod parse;
mod search;

pub use build::{
    build_draft, build_email_get, build_empty_trash, build_keyword_update,
    build_mailbox_create_archive, build_mailbox_get, build_move, build_send, build_thread_get,
    build_thread_query, OutboundAttachment, OutboundMail,
};
pub use client::{display_name, valid_blob_id, JmapClient};
pub use parse::{
    assemble_thread_page, clean_subject, decode_cursor, encode_cursor, parse_email_list,
    parse_mailboxes, parse_method_responses, parse_threads, EmailRecord, Mailbox, MethodResponse,
    ThreadDetail, ThreadEmails, ThreadPage, ThreadSummary,
};
pub use search::search_filter;
