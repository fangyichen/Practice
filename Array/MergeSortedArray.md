Given two sorted integer arrays A and B, merge B into A as one sorted array.

Note:
You may assume that A has enough space (size that is greater or equal to m + n) to hold additional elements from B. The number of elements initialized in A and B are m and n respectively.

```java
public class Solution {
    public void merge(int A[], int m, int B[], int n) {
        int insertIndex = m+n-1;
        n--;
        m--;
        while(insertIndex >= 0){
            if(n<0) break;
            if(m<0 ) {
                A[insertIndex] = B[n];
                n--;
                insertIndex--;
                continue;
            }
            if(A[m]>=B[n]) {
                A[insertIndex] = A[m];
                m--;
                insertIndex--;
            }
            else {
                
                A[insertIndex] = B[n];
                n--;
                insertIndex--;
            }
            
        }
    }
}
```