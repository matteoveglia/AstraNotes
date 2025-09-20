#!/bin/bash

# Test script for playlist deduplication functionality
# Usage: ./scripts/test-deduplication.sh [integration|performance|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Default to running all tests if no argument provided
TEST_TYPE=${1:-all}

print_status "Running playlist deduplication tests..."
print_status "Test type: $TEST_TYPE"

case $TEST_TYPE in
    "integration")
        print_status "Running integration tests..."
        npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --reporter=verbose
        ;;
    "performance")
        print_status "Running performance tests..."
        npm run test -- src/test/performance/PlaylistDeduplicationPerformance.test.ts --reporter=verbose
        ;;
    "all")
        print_status "Running all deduplication tests..."
        
        print_status "1/2 Running integration tests..."
        npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --reporter=verbose
        
        print_status "2/2 Running performance tests..."
        npm run test -- src/test/performance/PlaylistDeduplicationPerformance.test.ts --reporter=verbose
        ;;
    *)
        print_error "Invalid test type: $TEST_TYPE"
        print_error "Usage: $0 [integration|performance|all]"
        exit 1
        ;;
esac

print_success "Deduplication tests completed!"

# Optional: Run a quick smoke test to verify the fix
print_status "Running quick smoke test..."
npm run test -- src/test/integration/PlaylistDeduplication.test.tsx --reporter=verbose --testNamePattern="should prevent duplicate database entries during concurrent refresh operations"

if [ $? -eq 0 ]; then
    print_success "✅ Smoke test passed - race condition fix is working!"
else
    print_error "❌ Smoke test failed - there may be issues with the fix"
    exit 1
fi