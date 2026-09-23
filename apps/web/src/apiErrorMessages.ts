import type { TFunction } from 'i18next';

type ApiErrorLike = Error & {
  status: number;
  code?: string;
};

const localizedErrorKeys: Record<string, string> = {
  BAD_REQUEST: 'apiErrors.badRequest',
  AUTHENTICATION_REQUIRED: 'apiErrors.authenticationRequired',
  FORBIDDEN: 'apiErrors.forbidden',
  NOT_FOUND: 'apiErrors.notFound',
  CONFLICT: 'apiErrors.conflict',
  PAYLOAD_TOO_LARGE: 'apiErrors.payloadTooLarge',
  RATE_LIMITED: 'apiErrors.rateLimited',
  SERVICE_UNAVAILABLE: 'apiErrors.serviceUnavailable',
  INVALID_SERVER_RESPONSE: 'apiErrors.invalidServerResponse',
  NETWORK_UNAVAILABLE: 'apiErrors.networkUnavailable',
  DISPLAY_NAME_INVALID: 'apiErrors.displayNameInvalid',
  EMAIL_ALREADY_REGISTERED: 'apiErrors.emailAlreadyRegistered',
  INVALID_CREDENTIALS: 'apiErrors.invalidCredentials',
  USER_NOT_FOUND: 'apiErrors.userNotFound',
  LAST_ADMINISTRATOR: 'apiErrors.lastAdministrator',
  ADMINISTRATOR_REQUIRED: 'apiErrors.administratorRequired',
  REGISTRATION_CLOSED: 'apiErrors.registrationClosed',
  INVITATION_CODE_INVALID: 'apiErrors.invitationCodeInvalid',
  STORY_NOT_FOUND: 'apiErrors.storyNotFound',
  COLLABORATOR_ACCOUNT_INVALID: 'apiErrors.collaboratorAccountInvalid',
  COMMENT_RESOLVE_FORBIDDEN: 'apiErrors.commentResolveForbidden',
  COMMENT_MOVE_FORBIDDEN: 'apiErrors.commentMoveForbidden',
  COMMENT_DELETE_FORBIDDEN: 'apiErrors.commentDeleteForbidden',
  COMMENT_RESTORE_FORBIDDEN: 'apiErrors.commentRestoreForbidden',
  COMMENT_THREAD_NOT_DELETED: 'apiErrors.commentThreadNotDeleted',
  COMMENT_THREAD_NOT_FOUND: 'apiErrors.commentThreadNotFound',
  COMMENT_VIEW_FORBIDDEN: 'apiErrors.commentViewForbidden',
  COMMENT_CREATE_FORBIDDEN: 'apiErrors.commentCreateForbidden',
  COMMENT_TARGET_NOT_FOUND: 'apiErrors.commentTargetNotFound',
  COMMENT_TEXT_NOT_FOUND: 'apiErrors.commentTextNotFound',
  COMMENT_BODY_INVALID: 'apiErrors.commentBodyInvalid',
  CHOICESCRIPT_IMPORT_TOO_LARGE: 'apiErrors.choiceScriptImportTooLarge',
  QSP_IMPORT_FORMAT_MISMATCH: 'apiErrors.qspImportFormatMismatch',
  QSP_IMPORT_TOO_LARGE: 'apiErrors.qspImportTooLarge',
  QSP_LOCATION_BUNDLE_INVALID: 'apiErrors.qspLocationBundleInvalid',
  QSP_SOURCE_INVALID_UTF8: 'apiErrors.qspSourceInvalidUtf8',
  STORY_IMPORT_FAILED: 'apiErrors.storyImportFailed',
  STORY_REVISION_CONFLICT: 'apiErrors.storyRevisionConflict',
};

/**
 * Converts an API failure into interface copy without coupling the transport layer to i18n.
 * Generic HTTP codes never expose their server message because it is usually English and may
 * contain implementation details. A future explicit application code may use its server message
 * until the web client gains a translation for it.
 */
export function apiErrorMessage(caught: unknown, t: TFunction, fallback: string): string {
  if (!isApiErrorLike(caught)) {
    return caught instanceof Error && caught.message.trim() ? caught.message : fallback;
  }
  const code = caught.code;
  if (code && localizedErrorKeys[code]) return t(localizedErrorKeys[code]);
  if (code && !isGenericCode(code) && caught.message.trim()) return caught.message;
  return fallback;
}

export function isApiErrorLike(caught: unknown): caught is ApiErrorLike {
  return (
    caught instanceof Error &&
    'status' in caught &&
    typeof caught.status === 'number' &&
    (!('code' in caught) || caught.code === undefined || typeof caught.code === 'string')
  );
}

function isGenericCode(code: string): boolean {
  return code in localizedErrorKeys || /^HTTP_\d{3}$/.test(code);
}
