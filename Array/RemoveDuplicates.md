Given a sorted array, remove the duplicates in place such that each element appear only once and return the new length.

Do not allocate extra space for another array, you must do this in place with constant memory.

For example,
Given input array A = [1,1,2],

Your function should return length = 2, and A is now [1,2].

```java
public class Solution {
    public int removeDuplicates(int[] A) {
        if(A.length <=1) return A.length;
        int result = A.length;
        int insertIndex = 1;
        int curr = A[0];
        for(int i = 1; i < A.length; i++){
            if(A[i] != curr){
                A[insertIndex] = A[i];
                curr = A[insertIndex];
                insertIndex++;
            }
            else result--;
        }
        return result;
    }
}
```