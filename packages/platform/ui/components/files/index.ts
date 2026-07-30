/**
 * File browsing and upload — storage-agnostic by construction.
 *
 * Nothing here fetches, uploads, signs a URL or knows a storage backend. `Dropzone` hands over raw
 * `File` objects and `FileManager` reports navigation and selection by id; what happens next — S3, a
 * signed upload, a document API, an in-memory form — is the product's, and a component that assumed
 * one of them would be unusable for the next.
 */
export {
  Dropzone,
  formatFileSize,
  type DropzoneProps,
  type DropzoneLabels,
  type FileRejection,
  type FileRejectionReason,
} from './dropzone.js';
export {
  FileManager,
  type FileManagerProps,
  type FileManagerLabels,
  type FileManagerView,
  type FileNode,
} from './file-manager.js';
