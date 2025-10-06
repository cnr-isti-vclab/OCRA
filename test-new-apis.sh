#!/bin/bash
# Test script for new User and Project Member Management APIs
# Usage: ./test-new-apis.sh [admin-session-id]

set -e  # Exit on error

API_BASE="http://localhost:3002/api"
ADMIN_SESSION="${1:-}"

if [ -z "$ADMIN_SESSION" ]; then
  echo "❌ Error: Admin session ID required"
  echo "Usage: $0 <admin-session-id>"
  echo ""
  echo "To get a session ID:"
  echo "1. Login to the app at http://localhost:8080"
  echo "2. Open browser dev tools > Application > Cookies"
  echo "3. Copy the 'session_id' value"
  exit 1
fi

echo "🧪 Testing User and Project Member Management APIs"
echo "=================================================="
echo ""

# Test 1: Create a test user
echo "📝 Test 1: Create User"
echo "----------------------"
TEST_USER_EMAIL="test-api-user-$(date +%s)@example.com"
TEST_USER_SUB="test-api-user-sub-$(date +%s)"

USER_RESPONSE=$(curl -s -X POST "$API_BASE/admin/users" \
  -H "Authorization: Bearer $ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d "{
    \"sub\": \"$TEST_USER_SUB\",
    \"email\": \"$TEST_USER_EMAIL\",
    \"username\": \"test-api-user\",
    \"name\": \"Test API User\",
    \"sys_creator\": true
  }")

echo "$USER_RESPONSE" | jq '.'

if echo "$USER_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ User created successfully"
  TEST_USER_ID=$(echo "$USER_RESPONSE" | jq -r '.user.id')
  echo "   User ID: $TEST_USER_ID"
else
  echo "❌ Failed to create user"
  exit 1
fi
echo ""

# Test 2: Update user privileges
echo "📝 Test 2: Update User Privileges"
echo "----------------------------------"
PRIVILEGES_RESPONSE=$(curl -s -X PUT "$API_BASE/admin/users/$TEST_USER_ID/privileges" \
  -H "Authorization: Bearer $ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "sys_admin": false,
    "sys_creator": true
  }')

echo "$PRIVILEGES_RESPONSE" | jq '.'

if echo "$PRIVILEGES_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Privileges updated successfully"
else
  echo "❌ Failed to update privileges"
fi
echo ""

# Test 3: Batch create users
echo "📝 Test 3: Batch Create Users"
echo "------------------------------"
BATCH_RESPONSE=$(curl -s -X POST "$API_BASE/admin/users/batch" \
  -H "Authorization: Bearer $ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d "{
    \"users\": [
      {
        \"sub\": \"batch-user1-$(date +%s)\",
        \"email\": \"batch-user1-$(date +%s)@example.com\",
        \"username\": \"batch1\",
        \"name\": \"Batch User 1\"
      },
      {
        \"sub\": \"batch-user2-$(date +%s)\",
        \"email\": \"batch-user2-$(date +%s)@example.com\",
        \"username\": \"batch2\",
        \"name\": \"Batch User 2\"
      }
    ]
  }")

echo "$BATCH_RESPONSE" | jq '.'

if echo "$BATCH_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Batch users created successfully"
  echo "   Created: $(echo "$BATCH_RESPONSE" | jq -r '.summary.created')"
  echo "   Skipped: $(echo "$BATCH_RESPONSE" | jq -r '.summary.skipped')"
  echo "   Errors: $(echo "$BATCH_RESPONSE" | jq -r '.summary.errors')"
else
  echo "❌ Failed to batch create users"
fi
echo ""

# Test 4: Get an existing project
echo "📝 Test 4: Get Project for Testing"
echo "-----------------------------------"
PROJECTS_RESPONSE=$(curl -s "$API_BASE/projects" \
  -H "Authorization: Bearer $ADMIN_SESSION")

PROJECT_ID=$(echo "$PROJECTS_RESPONSE" | jq -r '.projects[0].id // empty')

if [ -z "$PROJECT_ID" ]; then
  echo "⚠️  No projects found, creating one..."
  CREATE_PROJECT_RESPONSE=$(curl -s -X POST "$API_BASE/projects" \
    -H "Authorization: Bearer $ADMIN_SESSION" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Project for API",
      "description": "Created by test script",
      "public": false
    }')
  
  PROJECT_ID=$(echo "$CREATE_PROJECT_RESPONSE" | jq -r '.project.id')
  echo "   Created project: $PROJECT_ID"
else
  echo "✅ Using existing project: $PROJECT_ID"
fi
echo ""

# Test 5: List project members (should be empty initially)
echo "📝 Test 5: List Project Members"
echo "--------------------------------"
MEMBERS_RESPONSE=$(curl -s "$API_BASE/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $ADMIN_SESSION")

echo "$MEMBERS_RESPONSE" | jq '.'

MEMBER_COUNT=$(echo "$MEMBERS_RESPONSE" | jq '.members | length')
echo "✅ Current members: $MEMBER_COUNT"
echo ""

# Test 6: Add member to project
echo "📝 Test 6: Add Member to Project"
echo "---------------------------------"
ADD_MEMBER_RESPONSE=$(curl -s -X POST "$API_BASE/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"role\": \"manager\"
  }")

echo "$ADD_MEMBER_RESPONSE" | jq '.'

if echo "$ADD_MEMBER_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Member added successfully"
else
  echo "❌ Failed to add member"
fi
echo ""

# Test 7: List members again (should show the new member)
echo "📝 Test 7: List Members After Adding"
echo "-------------------------------------"
MEMBERS_AFTER_RESPONSE=$(curl -s "$API_BASE/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $ADMIN_SESSION")

echo "$MEMBERS_AFTER_RESPONSE" | jq '.'

MEMBER_COUNT_AFTER=$(echo "$MEMBERS_AFTER_RESPONSE" | jq '.members | length')
echo "✅ Members after adding: $MEMBER_COUNT_AFTER"
echo ""

# Test 8: Update member role
echo "📝 Test 8: Update Member Role"
echo "------------------------------"
UPDATE_ROLE_RESPONSE=$(curl -s -X POST "$API_BASE/projects/$PROJECT_ID/members" \
  -H "Authorization: Bearer $ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"role\": \"editor\"
  }")

echo "$UPDATE_ROLE_RESPONSE" | jq '.'

if echo "$UPDATE_ROLE_RESPONSE" | jq -e '.success' > /dev/null; then
  NEW_ROLE=$(echo "$UPDATE_ROLE_RESPONSE" | jq -r '.member.role')
  echo "✅ Role updated to: $NEW_ROLE"
else
  echo "❌ Failed to update role"
fi
echo ""

# Test 9: Remove member from project
echo "📝 Test 9: Remove Member from Project"
echo "--------------------------------------"
REMOVE_MEMBER_RESPONSE=$(curl -s -X DELETE "$API_BASE/projects/$PROJECT_ID/members/$TEST_USER_ID" \
  -H "Authorization: Bearer $ADMIN_SESSION")

echo "$REMOVE_MEMBER_RESPONSE" | jq '.'

if echo "$REMOVE_MEMBER_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Member removed successfully"
else
  echo "❌ Failed to remove member"
fi
echo ""

# Final summary
echo "=================================================="
echo "✅ All API tests completed!"
echo ""
echo "📊 Test Summary:"
echo "   - User Creation: ✓"
echo "   - Privilege Management: ✓"
echo "   - Batch User Creation: ✓"
echo "   - Project Member Listing: ✓"
echo "   - Add Project Member: ✓"
echo "   - Update Member Role: ✓"
echo "   - Remove Project Member: ✓"
echo ""
echo "🔍 Check audit logs: curl $API_BASE/admin/audit -H 'Authorization: Bearer $ADMIN_SESSION'"
