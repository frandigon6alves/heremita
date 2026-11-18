-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('pt-BR', 'en');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('system', 'light', 'dark');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'moderator');

-- CreateEnum
CREATE TYPE "TripVisibility" AS ENUM ('private', 'link', 'public');

-- CreateEnum
CREATE TYPE "PlaceSource" AS ENUM ('osm', 'custom');

-- CreateEnum
CREATE TYPE "OsmType" AS ENUM ('N', 'W', 'R');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('sight', 'food', 'cafe', 'nightlife', 'lodging', 'shopping', 'nature', 'beach', 'culture', 'transport', 'activity', 'other');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('walk', 'bike', 'drive');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('published', 'hidden');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('review', 'trip');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('spam', 'offensive', 'misleading', 'personal_data', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'actioned', 'dismissed');

-- DropTable
DROP TABLE "placeholders";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "locale" "Locale" NOT NULL DEFAULT 'pt-BR',
    "theme" "ThemePreference" NOT NULL DEFAULT 'system',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "token_hash" BYTEA NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "destination_name" VARCHAR(120),
    "destination_country_code" CHAR(2),
    "destination_lng" DOUBLE PRECISION,
    "destination_lat" DOUBLE PRECISION,
    "start_date" DATE,
    "visibility" "TripVisibility" NOT NULL DEFAULT 'private',
    "share_token" VARCHAR(32),
    "default_mode" "TravelMode" NOT NULL DEFAULT 'walk',
    "plan_version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "moderation_hidden_at" TIMESTAMPTZ(3),
    "copied_from_trip_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "source" "PlaceSource" NOT NULL,
    "osm_type" "OsmType",
    "osm_id" BIGINT,
    "trip_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "label" VARCHAR(300),
    "category" "PlaceCategory" NOT NULL,
    "osm_key" VARCHAR(64),
    "osm_value" VARCHAR(64),
    "lng" DOUBLE PRECISION NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "address" JSONB,
    "country_code" CHAR(2),
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_places" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "trip_id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "note" VARCHAR(4000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trip_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "days" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "trip_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "mode_override" "TravelMode",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stops" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "trip_id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "trip_place_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "mode_to_next" "TravelMode",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "place_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "visited_on" DATE NOT NULL,
    "language" "Locale" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'published',
    "hidden_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reporter_id" UUID,
    "target_type" "ReportTarget" NOT NULL,
    "review_id" UUID,
    "trip_id" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "provider_cache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "trips_share_token_key" ON "trips"("share_token");

-- CreateIndex
CREATE INDEX "trips_owner_id_updated_at_id_idx" ON "trips"("owner_id", "updated_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "trips_discovery_idx" ON "trips"("published_at" DESC, "id" DESC) WHERE (visibility = 'public' AND moderation_hidden_at IS NULL);

-- CreateIndex
CREATE INDEX "trips_author_public_idx" ON "trips"("owner_id", "published_at" DESC, "id" DESC) WHERE (visibility = 'public' AND moderation_hidden_at IS NULL);

-- CreateIndex
CREATE INDEX "trips_copied_from_trip_id_idx" ON "trips"("copied_from_trip_id");

-- CreateIndex
CREATE INDEX "places_trip_id_idx" ON "places"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "places_osm_type_osm_id_key" ON "places"("osm_type", "osm_id");

-- CreateIndex
CREATE INDEX "trip_places_place_id_idx" ON "trip_places"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_places_trip_id_place_id_key" ON "trip_places"("trip_id", "place_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_places_id_trip_id_key" ON "trip_places"("id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "days_trip_id_position_key" ON "days"("trip_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "days_id_trip_id_key" ON "days"("id", "trip_id");

-- CreateIndex
CREATE INDEX "stops_trip_place_id_idx" ON "stops"("trip_place_id");

-- CreateIndex
CREATE INDEX "stops_trip_id_idx" ON "stops"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "stops_day_id_position_key" ON "stops"("day_id", "position");

-- CreateIndex
CREATE INDEX "reviews_place_id_status_created_at_id_idx" ON "reviews"("place_id", "status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "reviews_place_id_status_rating_created_at_id_idx" ON "reviews"("place_id", "status", "rating", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "reviews_author_id_created_at_id_idx" ON "reviews"("author_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_place_id_author_id_key" ON "reviews"("place_id", "author_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_review_id_idx" ON "reports"("review_id");

-- CreateIndex
CREATE INDEX "reports_trip_id_idx" ON "reports"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_review_id_key" ON "reports"("reporter_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_trip_id_key" ON "reports"("reporter_id", "trip_id");

-- CreateIndex
CREATE INDEX "user_blocks_blocked_id_idx" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE INDEX "provider_cache_expires_at_idx" ON "provider_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_copied_from_trip_id_fkey" FOREIGN KEY ("copied_from_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "days" ADD CONSTRAINT "days_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_day_id_trip_id_fkey" FOREIGN KEY ("day_id", "trip_id") REFERENCES "days"("id", "trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_place_id_trip_id_fkey" FOREIGN KEY ("trip_place_id", "trip_id") REFERENCES "trip_places"("id", "trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: Prisma cannot model extensions or CHECK constraints.
-- Every constraint is named so a violation (SQLSTATE 23514) says which rule failed.
CREATE EXTENSION IF NOT EXISTS unaccent;
ALTER TABLE places ADD CONSTRAINT places_source_shape_chk CHECK (
  (source = 'osm' AND osm_type IS NOT NULL AND osm_id IS NOT NULL AND trip_id IS NULL)
  OR (source = 'custom' AND osm_type IS NULL AND osm_id IS NULL AND trip_id IS NOT NULL));
ALTER TABLE places ADD CONSTRAINT places_lng_lat_chk CHECK (lng BETWEEN -180 AND 180 AND lat BETWEEN -90 AND 90);
ALTER TABLE trips ADD CONSTRAINT trips_destination_point_chk CHECK ((destination_lng IS NULL) = (destination_lat IS NULL));
ALTER TABLE trips ADD CONSTRAINT trips_published_chk CHECK ((visibility = 'public') = (published_at IS NOT NULL));
ALTER TABLE trips ADD CONSTRAINT trips_share_token_chk CHECK (visibility = 'private' OR share_token IS NOT NULL);
ALTER TABLE trips ADD CONSTRAINT trips_plan_version_chk CHECK (plan_version >= 0);
ALTER TABLE days ADD CONSTRAINT days_position_chk CHECK (position >= 0);
ALTER TABLE stops ADD CONSTRAINT stops_position_chk CHECK (position >= 0);
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE reviews ADD CONSTRAINT reviews_body_len_chk CHECK (char_length(body) BETWEEN 10 AND 2000);
ALTER TABLE reviews ADD CONSTRAINT reviews_visited_on_chk CHECK (extract(day FROM visited_on) = 1);
ALTER TABLE reviews ADD CONSTRAINT reviews_hidden_chk CHECK ((status = 'hidden') = (hidden_at IS NOT NULL));
ALTER TABLE reports ADD CONSTRAINT reports_target_chk CHECK (
  (target_type = 'review' AND review_id IS NOT NULL AND trip_id IS NULL)
  OR (target_type = 'trip' AND trip_id IS NOT NULL AND review_id IS NULL));
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_not_self_chk CHECK (blocker_id <> blocked_id);
