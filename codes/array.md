[TechInterviewHandbook Array Page link](https://www.techinterviewhandbook.org/algorithms/array/)

### Lession 1:
- When use slice or concatenate operations, it creates a brand new array and physically copy the elements over. As you learned in the contiguous memory lesson, copying takes $O(n)$ time. If you do this inside a loop, your fast $O(n)$ algorithm suddenly degrades into a slow $O(n^2)$ algorithm. 
- Problem Example: Binary Search

### Lession 2:
- #IndexOutOfBoundsException (incase of java or cpp, not in js)
- If you access an invalid index, JS simply returns undefined. If you then try to do math with undefined (e.g., undefined + 5), you get NaN (Not a Number), which ruins your entire calculation without throwing an error.
- How to approach it: Always double-check your loop conditions (i < arr.length). Be highly suspicious anytime you write arr[i + 1] or arr[i - 1] inside a loop.
- Problem Example: Validate Palindrome or Two Sum (Sorted)

### Lession 3:
- In case of Duplicate:
  - If duplicates exist, it can cause infinite loops, double-counting, or require you to do extra work to filter them out. Sometimes, duplicates make a problem harder (you have to skip them to avoid duplicate answers), and sometimes they make it simpler (if you just need to find if any duplicate exists).
  - Always ask the interviewer: "Can this array contain negative numbers, and are there duplicate values?" If duplicates are a problem, you can either convert the array to a Set to remove them, or sort the array and use a while loop to skip past adjacent identical values.
  - Problem Example: 3Sum (Find all unique triplets that sum to zero)


### Lession 4:
- Corner Cases: The Edge Case
- Use simple if statements at the very top of your function that handle the weird, tiny cases immediately so the rest of your complex code doesn't have to worry about them.
- Problem Example: Maximum Subarray (Kadane's Algorithm) or Best Time to Buy and Sell Stock
