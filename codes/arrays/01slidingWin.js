/*
 LeetCode 643. Maximum Average Subarray I
 Problem Statement: You are given an integer array nums consisting of n elements, and an integer k.
 Find a contiguous subarray whose length is equal to k that has the maximum average value and return this value. 
 Any answer with a calculation error less than 10^-5 will be accepted.
 Constraints:
 - n == nums.length
 - 1 <= k <= n <= 10^5
 - -10^4 <= nums[i] <= 10^4

## English:
1. max avg is the sum of k elements divided by k - means we just have to find which contiguous
   subarray can give us the max sum
2. keep the window size = k; start from i = 0; until the kth element - add these elem to get the initial sum; which will be the max_sum now
3. now start from kth element; and keep adding the new element and removing the first element of the window
4. update the max_sum if the current sum is greater
5. return max_sum / k

*/



function findMaxAverage(nums, k) {

    let max_sum = 0;
    
    // Calculate sum of first window of size k
    for (let i = 0; i < k; i++) {
        max_sum += nums[i];
    }
    
    // Slide the window from left to right
    let current_sum = max_sum;
    for (let i = k; i < nums.length; i++) {
        current_sum = current_sum - nums[i - k] + nums[i];
        max_sum = Math.max(max_sum, current_sum);
    }
    console.log(`max_sum: ${max_sum}`);
    return max_sum / k;
}

// Test cases
console.log(findMaxAverage([1, 12, -5, -6, 50, 3], 4)); // Expected: 12.75
console.log(findMaxAverage([5], 1)); // Expected: 5.00000
console.log(findMaxAverage([0, 1, 1, 0], 2)); // Expected: 1.00000


// in this same solution now i want to print which subarry was the one that lead to this max_sum

// solution:
function findMaxAverageWithSubarray(nums, k) {
    let max_sum = 0;
    
    // Calculate sum of first window of size k
    for (let i = 0; i < k; i++) {
        max_sum += nums[i];
    }
    
    // Slide the window from left to right
    let current_sum = max_sum;
    let max_start_index = 0;
    
    for (let i = k; i < nums.length; i++) {
        current_sum = current_sum - nums[i - k] + nums[i];
        if (current_sum > max_sum) {
            max_sum = current_sum;
            max_start_index = i - k + 1;
        }
    }
    
    const max_subarray = nums.slice(max_start_index, max_start_index + k);
    console.log(`max_sum: ${max_sum}, subarray: [${max_subarray.join(', ')}]`);
    return max_sum / k;
}

// Test cases
console.log(findMaxAverageWithSubarray([1, 12, -5, -6, 50, 3], 4)); // Expected: 12.75 with subarray [12, -5, -6, 50]
console.log(findMaxAverageWithSubarray([5], 1)); // Expected: 5.00000 with subarray [5]
console.log(findMaxAverageWithSubarray([0, 1, 1, 0], 2)); // Expected: 1.00000 with subarray [1, 1]