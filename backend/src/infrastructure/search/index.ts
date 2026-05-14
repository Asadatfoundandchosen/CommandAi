export {
  APP_SEARCH_INDEX_NAME,
  APP_SEARCH_INDEX_PATTERN,
  AUDIT_INDEX_PATTERN,
  auditIndexName,
  closeOpenSearch,
  connectOpenSearch,
  getOpenSearchClient,
  isOpenSearchConnected,
  requireOpenSearchClient,
} from "./elasticsearch.js";
export type { OpenSearchConnectionConfig } from "./elasticsearch.js";
