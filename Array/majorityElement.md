Given an array of size n, find the majority element. The majority element is the element that appears more than ⌊ n/2 ⌋ times.

You may assume that the array is non-empty and the majority element always exist in the array.

```java
public class Solution {
    public int majorityElement(int[] num) {
        Arrays.sort(num);
        int half = num.length/2;
       
            return num[half];
       
        
    }
}
```