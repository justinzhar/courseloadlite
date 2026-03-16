-- ============================================================
-- CourseLoad Lite — Supabase Setup
-- Run this once in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    code         VARCHAR(50)  NOT NULL,
    color        VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
    credit_hours SMALLINT     NOT NULL DEFAULT 3,
    term         VARCHAR(50)  NOT NULL DEFAULT 'Spring 2026',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_courses (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
    course_id  UUID NOT NULL REFERENCES courses(id)     ON DELETE CASCADE,
    is_active  BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS assignments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title            VARCHAR(500) NOT NULL,
    type             VARCHAR(20)  NOT NULL DEFAULT 'homework'
                         CHECK (type IN ('exam','project','homework','quiz','reading','other')),
    due_date         DATE    NOT NULL,
    estimated_hours  NUMERIC(5,2) NOT NULL DEFAULT 1,
    difficulty       SMALLINT     NOT NULL DEFAULT 3 CHECK (difficulty >= 1 AND difficulty <= 5),
    description      TEXT DEFAULT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_assignment_status (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id)     ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'not_started'
                      CHECK (status IN ('not_started','in_progress','done')),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, assignment_id)
);

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE courses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_courses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assignment_status ENABLE ROW LEVEL SECURITY;

-- Courses: owner only
CREATE POLICY "Users manage own courses"
    ON courses FOR ALL USING (auth.uid() = user_id);

-- User_courses: owner only
CREATE POLICY "Users manage own user_courses"
    ON user_courses FOR ALL USING (auth.uid() = user_id);

-- Assignments: anyone enrolled in the course
CREATE POLICY "Enrolled users can select assignments"
    ON assignments FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM user_courses
        WHERE course_id = assignments.course_id AND user_id = auth.uid()
    ));

CREATE POLICY "Enrolled users can insert assignments"
    ON assignments FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM user_courses
        WHERE course_id = assignments.course_id AND user_id = auth.uid()
    ));

CREATE POLICY "Enrolled users can update assignments"
    ON assignments FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM user_courses
        WHERE course_id = assignments.course_id AND user_id = auth.uid()
    ));

CREATE POLICY "Enrolled users can delete assignments"
    ON assignments FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM user_courses
        WHERE course_id = assignments.course_id AND user_id = auth.uid()
    ));

-- Assignment status: owner only
CREATE POLICY "Users manage own assignment status"
    ON user_assignment_status FOR ALL USING (auth.uid() = user_id);

SELECT 'CourseLoad Lite schema ready!' AS status;
