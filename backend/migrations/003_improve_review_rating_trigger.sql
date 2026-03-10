-- Migration: 003_improve_review_rating_trigger
-- Created: 2026-03-10
-- Description: Improve the review rating trigger to handle DELETE operations and edge cases

-- Drop existing trigger
DROP TRIGGER IF EXISTS update_agent_rating_on_review ON reviews;

-- Recreate the function with better handling
CREATE OR REPLACE FUNCTION update_agent_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_agent_id UUID;
BEGIN
  -- Determine which agent_id to update
  IF TG_OP = 'DELETE' THEN
    target_agent_id := OLD.agent_id;
  ELSE
    target_agent_id := NEW.agent_id;
  END IF;

  -- Update agent statistics
  UPDATE agents
  SET
    rating_average = (
      SELECT COALESCE(AVG(rating)::DECIMAL(3,2), 0)
      FROM reviews
      WHERE agent_id = target_agent_id
        AND status = 'approved'
        AND deleted_at IS NULL
    ),
    reviews_count = (
      SELECT COUNT(*)
      FROM reviews
      WHERE agent_id = target_agent_id
        AND status = 'approved'
        AND deleted_at IS NULL
    )
  WHERE id = target_agent_id;

  -- Return appropriate value based on operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ language 'plpgsql';

-- Recreate trigger to handle INSERT, UPDATE, and DELETE
CREATE TRIGGER update_agent_rating_on_review
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_agent_rating();

-- Also handle the case when status changes from approved to something else
-- This ensures statistics are recalculated when a review is unapproved
COMMENT ON TRIGGER update_agent_rating_on_review ON reviews IS
'Automatically updates agent rating_average and reviews_count when reviews are created, updated, or deleted';
