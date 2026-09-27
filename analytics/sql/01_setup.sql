-- One-time setup: an extra-small warehouse that suspends after 60 seconds idle, the database and the schema.
-- Run by scripts/load.py before anything else.

CREATE WAREHOUSE IF NOT EXISTS SMOKE_OR_FIRE_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

-- In case the warehouse already existed with other settings.
ALTER WAREHOUSE SMOKE_OR_FIRE_WH SET WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;

CREATE DATABASE IF NOT EXISTS SMOKE_OR_FIRE;

CREATE SCHEMA IF NOT EXISTS SMOKE_OR_FIRE.SEASON_2025;
