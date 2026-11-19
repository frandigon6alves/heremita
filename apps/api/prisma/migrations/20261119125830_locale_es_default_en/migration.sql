-- AlterEnum
ALTER TYPE "Locale" ADD VALUE 'es';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'en';
