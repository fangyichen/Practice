Given an array and a value, remove all instances of that value in place and return the new length.

The order of elements can be changed. It doesn't matter what you leave beyond the new length.

```java
public class Solution {
    public int removeElement(int[] A, int elem) {
        int result = A.length;
        int swapIndex = 0;
        for(int i = A.length-1; i >= 0; i--){
            
            if(A[i] == elem){
                
                result--;
                continue;
            }
            
            else {
                if(swapIndex>=i) break;
                int temp = A[swapIndex];
                A[swapIndex] = A[i];
                A[i] = temp;
                swapIndex++;
                i++;
            }
        }
        return result;
    }
}
```