// backup/index.js -- public barrel for the Backup Framework (interfaces only).
export { BACKUP_TYPES } from './backupTypes.js';
export { assertValidBackupProvider, createBaseBackupProvider } from './backupContract.js';
export { assertValidBackupDestination, createBaseBackupDestination } from './backupDestinationContract.js';
export { createLocalDiskBackupDestination } from './destinations/localDiskBackupDestination.js';
