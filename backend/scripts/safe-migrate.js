import { execSync } from 'child_process';

function safeMigrate() {
  console.log('Running database migrations...');

  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('Migrations completed successfully');
    return true;
  } catch (error) {
    console.error('Migration failed:', error.message);
    return false;
  }
}

const success = safeMigrate();
process.exit(success ? 0 : 1);
